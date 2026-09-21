import type { DbClient } from "@/core/database/client";
import { getDefaultDb } from "@/core/database/client";
import type { DbExecutor } from "@/core/database/types";
import { TOKENS } from "@/core/di/tokens";
import { normalizeChatId } from "@/core/shared/telegram.utils";
import type { Buyer } from "@/modules/buyer/buyer.entity";
import { BuyerNotFoundError } from "@/modules/buyer/buyer.errors";
import type { IBuyerRepository } from "@/modules/buyer/buyer.repository.interface";
import type { ICatalogRepository } from "@/modules/catalog/catalog.repository.interface";
import type { LedgerTransaction } from "@/modules/ledger/entities/ledger-transaction.entity";
import { LedgerService } from "@/modules/ledger/ledger.service";
import type {
	AdminOrderQueueItem,
	BuyerLatestOrderResult,
	CancelOrderInput,
	CancelOrderResult,
	ClaimOrderInput,
	ClaimOrderResult,
	FulfilOrderInput,
	FulfilOrderResult,
	GetLatestOrderInput,
	PlaceOrderInput,
	PlaceOrderResult,
	RecentOrderWithCatalogItem,
	OrderCountBreakdownResult,
	GetOrderDetailForBuyerInput,
	BuyerOrderDetailResult,
	RejectOrderInput,
	RejectOrderResult,
} from "@/modules/order/dtos/order.dto";
import { Order } from "@/modules/order/order.entity";
import { redactBuyerInputs } from "@/modules/order/order.utils";
import {
	CatalogItemUnavailableError,
	InsufficientBalanceForOrderError,
	InvalidOrderStatusError,
	OrderAlreadyClaimedError,
	OrderNotClaimedByAdminError,
	OrderNotFoundError,
	OrderNotOwnedByBuyerError,
	OrderRejectionNoteRequiredError,
} from "@/modules/order/order.errors";
import type { ICredentialCryptoService, EncryptedCredential } from "@/core/crypto/credential-crypto.interface";
import type { IOrderNotifier } from "@/modules/order/interfaces/order.notifier.interface";
import type { IOrderRepository } from "@/modules/order/interfaces/order.repository.interface";
import type { Wallet } from "@/modules/wallet/wallet.entity";
import { WalletNotFoundError } from "@/modules/wallet/wallet.errors";
import type { IWalletRepository } from "@/modules/wallet/wallet.repository.interface";
import { inject, injectable } from "tsyringe";

@injectable()
export class OrderService {
	constructor(
		@inject(TOKENS.DbClient) private readonly db: DbClient,
		@inject(TOKENS.OrderRepository)
		private readonly orderRepo: IOrderRepository<DbExecutor>,
		@inject(TOKENS.CatalogRepository)
		private readonly catalogRepo: ICatalogRepository<DbExecutor>,
		@inject(TOKENS.BuyerRepository)
		private readonly buyerRepo: IBuyerRepository<DbExecutor>,
		@inject(TOKENS.WalletRepository)
		private readonly walletRepo: IWalletRepository<DbExecutor>,
		@inject(TOKENS.LedgerService)
		private readonly ledgerService: LedgerService,
		@inject(TOKENS.OrderNotifier)
		private readonly notifier?: IOrderNotifier,
		@inject(TOKENS.CredentialCryptoService)
		private readonly cryptoService?: ICredentialCryptoService,
	) {}

	private async resolveBuyer(
		input: {
			userId?: string | undefined;
			telegramChatId?: bigint | number | string | undefined;
		},
		client: DbExecutor,
	): Promise<Buyer> {
		if (input.userId) {
			const buyer = await this.buyerRepo.findById(input.userId, client);
			if (!buyer) {
				throw new BuyerNotFoundError(`Buyer with ID ${input.userId} not found.`);
			}
			return buyer;
		}
		if (input.telegramChatId !== undefined) {
			const chatId = normalizeChatId(input.telegramChatId);
			const buyer = await this.buyerRepo.findByTelegramChatId(chatId, client);
			if (!buyer) {
				throw new BuyerNotFoundError(`Buyer not found for telegram chat ID ${input.telegramChatId}`);
			}
			return buyer;
		}
		throw new Error("Either userId or telegramChatId must be provided.");
	}

	/**
	 * Executes the atomic Order Placement sequence:
	 * 1. Validates Catalog Item availability
	 * 2. Inside transaction:
	 *    - SELECT wallet FOR UPDATE
	 *    - Asserts available_balance >= usd_price_snapshot
	 *    - Inserts orders row at PLACED with price snapshot
	 *    - Inserts ledger_transactions with order_id and ledger_entries (DEBIT BUYER_WALLET + CREDIT SYSTEM_CASH)
	 *    - Updates wallet available_balance
	 * 3. Outside transaction:
	 *    - Dispatches push notifications to Admins
	 *    - Persists order_admin_notifications rows
	 */
	public async placeOrder(input: PlaceOrderInput, executor?: DbExecutor): Promise<PlaceOrderResult> {
		const client = (executor ?? this.db ?? getDefaultDb()) as DbClient;

		// 1. Resolve Buyer & Catalog Item
		const buyer = await this.resolveBuyer(input, client);
		const catalogItem = await this.catalogRepo.findById(input.catalogItemId, client);

		if (!catalogItem || !catalogItem.isActive) {
			throw new CatalogItemUnavailableError("The selected catalog item is no longer available.");
		}

		const priceSnapshot = catalogItem.usdAmountVo;

		// 2. Transaction execution
		const executePlacement = async (tx: DbExecutor): Promise<Omit<PlaceOrderResult, "adminNotifications">> => {
			// 2a. Lock wallet row
			const wallet = await this.walletRepo.findByUserIdForUpdate(buyer.id, tx);
			if (!wallet) {
				throw new WalletNotFoundError(`Wallet not found for buyer ID ${buyer.id}`);
			}

			// 2b. Assert sufficient balance
			if (wallet.availableBalanceVo.lt(priceSnapshot)) {
				throw new InsufficientBalanceForOrderError(
					`Insufficient available balance (${wallet.availableBalance}) for item price (${catalogItem.usdPrice}).`,
				);
			}

			// 2c. Create order at PLACED
			const order = await this.orderRepo.create(
				{
					userId: buyer.id,
					catalogItemId: catalogItem.id,
					usdPriceSnapshot: priceSnapshot,
					status: "PLACED",
					fulfillmentStrategySnapshot: catalogItem.fulfillmentStrategy,
					buyerInputs: input.buyerInputs ?? null,
				},
				tx,
			);

			// 2d. Record double-entry ledger transaction
			const { transaction: ledgerTx, entries: ledgerEntries } = await this.ledgerService.recordOrderSpend(
				{
					orderId: order.id,
					walletId: wallet.id,
					usdAmount: priceSnapshot,
				},
				tx,
			);

			// 2e. Update wallet available balance
			const newBalance = wallet.availableBalanceVo.minus(priceSnapshot);
			const updatedWallet = await this.walletRepo.updateBalance(wallet.id, newBalance, tx);

			return {
				order,
				wallet: updatedWallet,
				ledgerTransaction: ledgerTx,
				ledgerEntries,
				catalogItem,
				buyer,
			};
		};

		let txResult: Omit<PlaceOrderResult, "adminNotifications">;
		if ("transaction" in client && typeof client.transaction === "function") {
			txResult = await client.transaction(async (tx) => {
				return await executePlacement(tx);
			});
		} else {
			txResult = await executePlacement(client);
		}

		// 3. Dispatch admin push notifications (post-commit, fire-and-forget)
		if (this.notifier) {
			try {
				await this.notifier.onOrderPlaced({
					order: txResult.order,
					catalogItem: txResult.catalogItem,
					buyer: txResult.buyer,
					postDebitBalance: txResult.wallet.availableBalance,
				});
			} catch (notifyErr) {
				console.error(`Failed to dispatch admin notifications for order ${txResult.order.id}:`, notifyErr);
			}
		}

		const adminNotifications = await this.orderRepo.getAdminNotifications(txResult.order.id, client);

		return {
			...txResult,
			adminNotifications,
		};
	}

	/**
	 * Executes the atomic Order Claim sequence:
	 * 1. Inside transaction:
	 *    - SELECT order FOR UPDATE
	 *    - Asserts status = 'PLACED'; returns error if already claimed or closed
	 *    - UPDATE orders SET status = 'PROCESSING', claimed_by_admin_telegram_id = ?, claimed_at = now(), updated_at = now()
	 * 2. Commit transaction
	 * 3. Outside transaction:
	 *    - Reads all order_admin_notifications for this order
	 *    - Dispatches editMessageReplyMarkup updates (fire-and-forget)
	 */
	public async claimOrder(input: ClaimOrderInput, executor?: DbExecutor): Promise<ClaimOrderResult> {
		const client = (executor ?? this.db ?? getDefaultDb()) as DbClient;

		const executeClaim = async (tx: DbExecutor): Promise<Order> => {
			// 1a. Lock order row
			const order = await this.orderRepo.findByIdForUpdate(input.orderId, tx);
			if (!order) {
				throw new OrderNotFoundError(`Order with ID ${input.orderId} not found.`);
			}

			// 1b. Assert status is PLACED
			if (order.status === "PROCESSING") {
				throw new OrderAlreadyClaimedError(`Order ${order.id} has already been claimed by another admin.`);
			}

			if (order.status !== "PLACED") {
				throw new InvalidOrderStatusError(
					`Order ${order.id} cannot be claimed because it is in status '${order.status}'.`,
				);
			}

			// 1c. Update to PROCESSING
			const now = new Date();
			const updatedOrder = await this.orderRepo.updateStatus(
				order.id,
				"PROCESSING",
				{
					claimedByAdminTelegramId: BigInt(input.adminTelegramId),
					claimedAt: now,
					updatedAt: now,
				},
				tx,
			);

			if (!updatedOrder) {
				throw new Error(`Failed to update order ${order.id} to PROCESSING`);
			}

			return updatedOrder;
		};

		let claimedOrder: Order;
		if ("transaction" in client && typeof client.transaction === "function") {
			claimedOrder = await client.transaction(async (tx) => {
				return await executeClaim(tx);
			});
		} else {
			claimedOrder = await executeClaim(client);
		}

		// 2. Fetch admin notifications and order context
		const notifications = await this.orderRepo.getAdminNotifications(claimedOrder.id, client);
		const catalogItem = await this.catalogRepo.findById(claimedOrder.catalogItemId, client);
		const buyer = await this.buyerRepo.findById(claimedOrder.userId, client);
		const wallet = await this.walletRepo.findByUserId(claimedOrder.userId, client);

		let revealedPassword: string | undefined;
		const buyerInputs = claimedOrder.buyerInputs as Record<string, any> | null;
		if (
			this.cryptoService &&
			buyerInputs?.password &&
			typeof buyerInputs.password === "object" &&
			"ciphertext" in buyerInputs.password &&
			"iv" in buyerInputs.password &&
			"tag" in buyerInputs.password
		) {
			try {
				revealedPassword = this.cryptoService.decrypt(buyerInputs.password as EncryptedCredential);
			} catch {
				console.error(`Failed to decrypt credentials for order ${claimedOrder.id}`);
			}
		}

		// 3. Dispatch admin notification updates (outside transaction, fire-and-forget)
		if (this.notifier) {
			try {
				await this.notifier.onOrderClaimed({
					order: claimedOrder,
					catalogItem: catalogItem ?? undefined,
					buyer: buyer ?? undefined,
					notifications,
					claimedByAdminTelegramId: BigInt(input.adminTelegramId),
					claimedByAdminUsername: input.adminUsername,
					revealedPassword,
					buyerBalance: wallet?.availableBalance,
				});
			} catch (notifyErr) {
				console.error(`Failed to update admin notifications for claimed order ${claimedOrder.id}:`, notifyErr);
			}
		}

		return {
			order: claimedOrder,
			adminNotifications: notifications,
		};
	}

	/**
	 * Executes the atomic Order Fulfilment sequence:
	 * 1. Inside transaction:
	 *    - SELECT order FOR UPDATE
	 *    - Asserts caller is claimed_by_admin_telegram_id (throws OrderNotClaimedByAdminError)
	 *    - Asserts status = 'PROCESSING' (throws InvalidOrderStatusError)
	 *    - UPDATE orders SET status = 'FULFILLED', delivery_content = ?, fulfilled_at = now(), updated_at = now()
	 *    - Resolves Buyer for notification
	 * 2. Commit transaction
	 * 3. Outside transaction:
	 *    - Reads all order_admin_notifications for this order
	 *    - Forwards delivery content to the Buyer (fire-and-forget / try-catch resilient)
	 *    - Dispatches editMessageReplyMarkup updates to all Admins (fire-and-forget / try-catch resilient)
	 */
	public async fulfilOrder(input: FulfilOrderInput, executor?: DbExecutor): Promise<FulfilOrderResult> {
		const client = (executor ?? this.db ?? getDefaultDb()) as DbClient;
		const adminTelegramId = BigInt(input.adminTelegramId);
		const trimmedDeliveryContent = input.deliveryContent?.trim() || null;

		const executeFulfilment = async (tx: DbExecutor): Promise<{ order: Order; buyer: Buyer }> => {
			// 1a. Lock order row
			const order = await this.orderRepo.findByIdForUpdate(input.orderId, tx);
			if (!order) {
				throw new OrderNotFoundError(`Order with ID ${input.orderId} not found.`);
			}

			// 1b. Assert caller is claiming admin
			if (order.claimedByAdminTelegramId === null || order.claimedByAdminTelegramId !== adminTelegramId) {
				throw new OrderNotClaimedByAdminError(
					`Admin ${input.adminTelegramId} did not claim order ${order.id} and cannot fulfil it.`,
				);
			}

			// 1c. Assert status is PROCESSING
			if (order.status !== "PROCESSING") {
				throw new InvalidOrderStatusError(
					`Order ${order.id} cannot be fulfilled because it is in status '${order.status}'.`,
				);
			}

			// 1d. Update to FULFILLED
			const now = new Date();
			const deliveryContentToPersist =
				order.fulfillmentStrategySnapshot === "ACTIVATION" ? null : trimmedDeliveryContent;

			const updatedOrder = await this.orderRepo.updateStatus(
				order.id,
				"FULFILLED",
				{
					deliveryContent: deliveryContentToPersist,
					buyerInputs: redactBuyerInputs(order.buyerInputs),
					fulfilledAt: now,
					updatedAt: now,
				},
				tx,
			);

			if (!updatedOrder) {
				throw new Error(`Failed to update order ${order.id} to FULFILLED`);
			}

			// 1e. Resolve Buyer
			const buyer = await this.buyerRepo.findById(updatedOrder.userId, tx);
			if (!buyer) {
				throw new BuyerNotFoundError(`Buyer with ID ${updatedOrder.userId} not found for order ${updatedOrder.id}`);
			}

			return { order: updatedOrder, buyer };
		};

		let txResult: { order: Order; buyer: Buyer };
		if ("transaction" in client && typeof client.transaction === "function") {
			txResult = await client.transaction(async (tx) => {
				return await executeFulfilment(tx);
			});
		} else {
			txResult = await executeFulfilment(client);
		}

		// 2. Fetch admin notifications for this order
		const notifications = await this.orderRepo.getAdminNotifications(txResult.order.id, client);

		// 3. Dispatch notifications (outside transaction, fire-and-forget)
		if (this.notifier) {
			try {
				await this.notifier.onOrderFulfilled({
					order: txResult.order,
					buyer: txResult.buyer,
					deliveryContent: txResult.order.deliveryContent ?? undefined,
					notifications,
					adminTelegramId,
					adminUsername: input.adminUsername,
				});
			} catch (notifyErr) {
				console.error(`Failed to dispatch fulfilment notifications for order ${txResult.order.id}:`, notifyErr);
			}
		}

		return {
			order: txResult.order,
			buyer: txResult.buyer,
			adminNotifications: notifications,
		};
	}

	/**
	 * Executes the atomic Order Rejection sequence:
	 * 1. Inside transaction:
	 *    - SELECT order FOR UPDATE
	 *    - Asserts status IN ('PLACED', 'PROCESSING') (throws InvalidOrderStatusError if terminal)
	 *    - Asserts rejection note is present if category is 'OTHER' (throws OrderRejectionNoteRequiredError)
	 *    - SELECT wallet FOR UPDATE
	 *    - Writes refund ledger transaction (CREDIT BUYER_WALLET + DEBIT SYSTEM_CASH)
	 *      and sets reversed_by_ledger_transaction_id on the original debit transaction
	 *    - Updates wallet available_balance (available_balance + usd_price_snapshot)
	 *    - Updates order: status = 'REJECTED', rejection_category = ?, rejection_note = ?, rejected_at = now()
	 *    - Resolves Buyer
	 * 2. Commit transaction
	 * 3. Outside transaction:
	 *    - Fetches order_admin_notifications
	 *    - Dispatches Buyer push notification (fire-and-forget / resilient)
	 *    - Dispatches Admin notification edits (fire-and-forget / resilient)
	 */
	public async rejectOrder(input: RejectOrderInput, executor?: DbExecutor): Promise<RejectOrderResult> {
		const client = (executor ?? this.db ?? getDefaultDb()) as DbClient;
		const rejectionCategory = input.rejectionCategory.trim();
		const rejectionNote = input.rejectionNote?.trim() || null;
		const adminTelegramId = input.adminTelegramId !== undefined ? BigInt(input.adminTelegramId) : undefined;

		// Validate category requirement: if OTHER, note is mandatory
		if (rejectionCategory === "OTHER" && !rejectionNote) {
			throw new OrderRejectionNoteRequiredError("A rejection note is mandatory when selecting the OTHER category.");
		}

		const executeRejection = async (
			tx: DbExecutor,
		): Promise<{
			order: Order;
			wallet: Wallet;
			buyer: Buyer;
			refundLedgerTransaction: LedgerTransaction;
		}> => {
			// 1a. Lock order row
			const order = await this.orderRepo.findByIdForUpdate(input.orderId, tx);
			if (!order) {
				throw new OrderNotFoundError(`Order with ID ${input.orderId} not found.`);
			}

			// 1b. Assert status is PLACED or PROCESSING
			if (order.status !== "PLACED" && order.status !== "PROCESSING") {
				throw new InvalidOrderStatusError(
					`Order ${order.id} cannot be rejected because it is in status '${order.status}'.`,
				);
			}

			// 1c. Lock wallet row
			const wallet = await this.walletRepo.findByUserIdForUpdate(order.userId, tx);
			if (!wallet) {
				throw new WalletNotFoundError(`Wallet not found for buyer ID ${order.userId}`);
			}

			// 1d. Record refund double-entry ledger transaction & link to original
			const refundResult = await this.ledgerService.recordOrderRefund(
				{
					orderId: order.id,
					walletId: wallet.id,
					usdAmount: order.usdAmountVo,
					narrative: `Order rejection refund for order ${order.id}`,
				},
				tx,
			);

			// 1e. Restore Buyer available balance
			const newBalance = wallet.availableBalanceVo.plus(order.usdAmountVo);
			const updatedWallet = await this.walletRepo.updateBalance(wallet.id, newBalance, tx);

			// 1f. Update Order to REJECTED
			const now = new Date();
			const updatedOrder = await this.orderRepo.updateStatus(
				order.id,
				"REJECTED",
				{
					rejectionCategory,
					rejectionNote,
					buyerInputs: redactBuyerInputs(order.buyerInputs),
					rejectedAt: now,
					updatedAt: now,
				},
				tx,
			);

			if (!updatedOrder) {
				throw new Error(`Failed to update order ${order.id} to REJECTED`);
			}

			// 1g. Resolve Buyer
			const buyer = await this.buyerRepo.findById(updatedOrder.userId, tx);
			if (!buyer) {
				throw new BuyerNotFoundError(`Buyer with ID ${updatedOrder.userId} not found for order ${updatedOrder.id}`);
			}

			return {
				order: updatedOrder,
				wallet: updatedWallet,
				buyer,
				refundLedgerTransaction: refundResult.transaction,
			};
		};

		let txResult: {
			order: Order;
			wallet: Wallet;
			buyer: Buyer;
			refundLedgerTransaction: LedgerTransaction;
		};

		if ("transaction" in client && typeof client.transaction === "function") {
			txResult = await client.transaction(async (tx) => {
				return await executeRejection(tx);
			});
		} else {
			txResult = await executeRejection(client);
		}

		// 2. Fetch admin notifications for this order
		const notifications = await this.orderRepo.getAdminNotifications(txResult.order.id, client);

		// 3. Dispatch notifications (outside transaction, fire-and-forget / resilient)
		if (this.notifier) {
			try {
				await this.notifier.onOrderRejected({
					order: txResult.order,
					buyer: txResult.buyer,
					rejectionCategory,
					rejectionNote,
					refundAmount: txResult.order.usdPriceSnapshot,
					updatedBalance: txResult.wallet.availableBalance,
					notifications,
					adminTelegramId,
					adminUsername: input.adminUsername,
				});
			} catch (notifyErr) {
				console.error(`Failed to dispatch rejection notifications for order ${txResult.order.id}:`, notifyErr);
			}
		}

		return {
			order: txResult.order,
			wallet: txResult.wallet,
			buyer: txResult.buyer,
			refundLedgerTransaction: txResult.refundLedgerTransaction,
			adminNotifications: notifications,
		};
	}

	/**
	 * Executes the atomic Order Cancellation sequence (Buyer-initiated):
	 * 1. Resolves caller Buyer
	 * 2. Inside transaction:
	 *    - SELECT order FOR UPDATE
	 *    - Asserts caller user_id matches order.userId (throws OrderNotOwnedByBuyerError)
	 *    - Asserts status = 'PLACED' (throws InvalidOrderStatusError if claimed or terminal)
	 *    - SELECT wallet FOR UPDATE
	 *    - Writes refund ledger transaction (CREDIT BUYER_WALLET + DEBIT SYSTEM_CASH)
	 *      and sets reversed_by_ledger_transaction_id on the original debit transaction
	 *    - Updates wallet available_balance (available_balance + usd_price_snapshot)
	 *    - Updates order: status = 'CANCELLED', cancelled_at = now()
	 * 3. Commit transaction
	 * 4. Outside transaction:
	 *    - Fetches order_admin_notifications
	 *    - Dispatches Buyer push notification (fire-and-forget / resilient)
	 *    - Dispatches Admin notification edits to remove action buttons (fire-and-forget / resilient)
	 */
	public async cancelOrder(input: CancelOrderInput, executor?: DbExecutor): Promise<CancelOrderResult> {
		const client = (executor ?? this.db ?? getDefaultDb()) as DbClient;

		// 1. Resolve Buyer
		const buyer = await this.resolveBuyer(input, client);

		const executeCancellation = async (
			tx: DbExecutor,
		): Promise<{
			order: Order;
			wallet: Wallet;
			refundLedgerTransaction: LedgerTransaction;
		}> => {
			// 1a. Lock order row
			const order = await this.orderRepo.findByIdForUpdate(input.orderId, tx);
			if (!order) {
				throw new OrderNotFoundError(`Order with ID ${input.orderId} not found.`);
			}

			// 1b. Assert caller owns the order
			if (order.userId !== buyer.id) {
				throw new OrderNotOwnedByBuyerError(`Buyer ${buyer.id} is not the owner of order ${order.id}.`);
			}

			// 1c. Assert status is PLACED
			if (order.status !== "PLACED") {
				throw new InvalidOrderStatusError(
					`Order ${order.id} cannot be cancelled because it is in status '${order.status}'.`,
				);
			}

			// 1d. Lock wallet row
			const wallet = await this.walletRepo.findByUserIdForUpdate(buyer.id, tx);
			if (!wallet) {
				throw new WalletNotFoundError(`Wallet not found for buyer ID ${buyer.id}`);
			}

			// 1e. Record refund double-entry ledger transaction & link to original debit
			const refundResult = await this.ledgerService.recordOrderRefund(
				{
					orderId: order.id,
					walletId: wallet.id,
					usdAmount: order.usdAmountVo,
					narrative: `Order cancellation refund for order ${order.id}`,
				},
				tx,
			);

			// 1f. Restore Buyer available balance
			const newBalance = wallet.availableBalanceVo.plus(order.usdAmountVo);
			const updatedWallet = await this.walletRepo.updateBalance(wallet.id, newBalance, tx);

			// 1g. Update Order to CANCELLED
			const now = new Date();
			const updatedOrder = await this.orderRepo.updateStatus(
				order.id,
				"CANCELLED",
				{
					buyerInputs: redactBuyerInputs(order.buyerInputs),
					cancelledAt: now,
					updatedAt: now,
				},
				tx,
			);

			if (!updatedOrder) {
				throw new Error(`Failed to update order ${order.id} to CANCELLED`);
			}

			return {
				order: updatedOrder,
				wallet: updatedWallet,
				refundLedgerTransaction: refundResult.transaction,
			};
		};

		let txResult: {
			order: Order;
			wallet: Wallet;
			refundLedgerTransaction: LedgerTransaction;
		};

		if ("transaction" in client && typeof client.transaction === "function") {
			txResult = await client.transaction(async (tx) => {
				return await executeCancellation(tx);
			});
		} else {
			txResult = await executeCancellation(client);
		}

		// 2. Fetch admin notifications for this order
		const notifications = await this.orderRepo.getAdminNotifications(txResult.order.id, client);

		// 3. Dispatch notifications (outside transaction, fire-and-forget / resilient)
		if (this.notifier) {
			try {
				await this.notifier.onOrderCancelled({
					order: txResult.order,
					buyer,
					refundAmount: txResult.order.usdPriceSnapshot,
					updatedBalance: txResult.wallet.availableBalance,
					notifications,
				});
			} catch (notifyErr) {
				console.error(`Failed to dispatch cancellation notifications for order ${txResult.order.id}:`, notifyErr);
			}
		}

		return {
			order: txResult.order,
			wallet: txResult.wallet,
			buyer,
			refundLedgerTransaction: txResult.refundLedgerTransaction,
			adminNotifications: notifications,
		};
	}

	/**
	 * Retrieves an Order by ID.
	 */
	public async findById(orderId: string, executor?: DbExecutor): Promise<Order | null> {
		const client = executor ?? this.db ?? getDefaultDb();
		return await this.orderRepo.findById(orderId, client);
	}

	/**
	 * Retrieves the most recent Order for a Buyer by userId.
	 */
	public async getLatestOrderByUserId(userId: string, executor?: DbExecutor): Promise<Order | null> {
		const client = executor ?? this.db ?? getDefaultDb();
		return await this.orderRepo.findLatestByUserId(userId, client);
	}

	/**
	 * Retrieves the most recent Order for a Buyer regardless of status,
	 * along with its Catalog Item and Buyer entity.
	 */
	public async getLatestOrderForBuyer(
		input: GetLatestOrderInput,
		executor?: DbExecutor,
	): Promise<BuyerLatestOrderResult | null> {
		const client = executor ?? this.db ?? getDefaultDb();
		const buyer = await this.resolveBuyer(input, client);

		const latestOrder = await this.orderRepo.findLatestByUserId(buyer.id, client);
		if (!latestOrder) {
			return null;
		}

		const catalogItem = await this.catalogRepo.findById(latestOrder.catalogItemId, client);

		return {
			order: latestOrder,
			catalogItem,
			buyer,
		};
	}

	/**
	 * Retrieves all active orders in the queue (status PLACED or PROCESSING),
	 * including catalog item name, price snapshot, buyer details, and claim info.
	 * Terminal orders (FULFILLED, REJECTED, CANCELLED) are excluded.
	 */
	public async getAdminOrderQueue(executor?: DbExecutor): Promise<AdminOrderQueueItem[]> {
		const client = executor ?? this.db ?? getDefaultDb();
		return await this.orderRepo.findActiveOrders(client);
	}

	/**
	 * Retrieves the last N Orders for the Buyer in descending date order,
	 * each joined with its Catalog Item name.
	 */
	public async getRecentOrdersForBuyer(
		telegramChatId: bigint | number | string,
		limit: number = 5,
		executor?: DbExecutor,
	): Promise<RecentOrderWithCatalogItem[]> {
		const client = executor ?? this.db ?? getDefaultDb();
		const buyer = await this.resolveBuyer({ telegramChatId }, client);
		return await this.orderRepo.findRecentByBuyerId(buyer.id, limit, client);
	}

	/**
	 * Retrieves order count breakdown for a Buyer, grouped into three buckets:
	 * - fulfilled: FULFILLED
	 * - inProgress: PLACED + PROCESSING
	 * - cancelled: CANCELLED + REJECTED
	 */
	public async getOrderCountBreakdown(
		telegramChatId: bigint | number | string,
		executor?: DbExecutor,
	): Promise<OrderCountBreakdownResult> {
		const client = executor ?? this.db ?? getDefaultDb();
		const buyer = await this.resolveBuyer({ telegramChatId }, client);
		return await this.orderRepo.getCountBreakdownByBuyerId(buyer.id, client);
	}

	/**
	 * Retrieves an Order for a Buyer by orderId, asserting ownership.
	 * Returns null if the order doesn't exist or is not owned by the buyer.
	 */
	public async getOrderDetailForBuyer(
		input: GetOrderDetailForBuyerInput,
		executor?: DbExecutor,
	): Promise<BuyerOrderDetailResult | null> {
		const client = executor ?? this.db ?? getDefaultDb();
		const buyer = await this.resolveBuyer(input, client);

		const order = await this.orderRepo.findById(input.orderId, client);
		if (!order || order.userId !== buyer.id) {
			return null;
		}

		const catalogItem = await this.catalogRepo.findById(order.catalogItemId, client);

		return {
			order,
			catalogItem,
			buyer,
		};
	}
}
