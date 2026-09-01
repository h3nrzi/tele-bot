import { injectable, inject } from 'tsyringe';
import type { DbClient } from '@/core/database/client';
import { getDefaultDb } from '@/core/database/client';
import type { DbExecutor } from '@/core/database/types';
import type { IOrderRepository } from '@/modules/order/order.repository.interface';
import type { ICatalogRepository } from '@/modules/catalog/catalog.repository.interface';
import type { IBuyerRepository } from '@/modules/buyer/buyer.repository.interface';
import type { IWalletRepository } from '@/modules/wallet/wallet.repository.interface';
import { LedgerService } from '@/modules/ledger/ledger.service';
import { Order, OrderAdminNotification } from '@/modules/order/order.entity';
import {
  InsufficientBalanceForOrderError,
  CatalogItemUnavailableError,
  OrderNotFoundError,
  OrderAlreadyClaimedError,
  InvalidOrderStatusError,
  OrderNotClaimedByAdminError,
} from '@/modules/order/order.errors';
import { WalletNotFoundError } from '@/modules/wallet/wallet.errors';
import { BuyerNotFoundError } from '@/modules/buyer/buyer.errors';
import { normalizeChatId } from '@/core/shared/telegram.utils';
import type {
  PlaceOrderInput,
  PlaceOrderDependencies,
  PlaceOrderResult,
  OrderAdminNotificationContext,
  ClaimOrderInput,
  ClaimOrderDependencies,
  ClaimOrderResult,
  ClaimOrderNotificationContext,
  FulfilOrderInput,
  FulfilOrderDependencies,
  FulfilOrderResult,
  FulfilOrderNotificationContext,
} from '@/modules/order/dtos/order.dto';
import { TOKENS } from '@/core/di/tokens';
import type { Buyer } from '@/modules/buyer/buyer.entity';

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
    private readonly ledgerService: LedgerService
  ) { }

  private async resolveBuyer(
    input: { userId?: string | undefined; telegramChatId?: bigint | number | undefined },
    client: DbExecutor
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
        throw new BuyerNotFoundError(
          `Buyer not found for telegram chat ID ${input.telegramChatId}`
        );
      }
      return buyer;
    }
    throw new Error('Either userId or telegramChatId must be provided.');
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
  public async placeOrder(
    input: PlaceOrderInput,
    dependencies?: PlaceOrderDependencies,
    executor?: DbExecutor
  ): Promise<PlaceOrderResult> {
    const client = (executor ?? this.db ?? getDefaultDb()) as DbClient;

    // 1. Resolve Buyer & Catalog Item
    const buyer = await this.resolveBuyer(input, client);
    const catalogItem = await this.catalogRepo.findById(
      input.catalogItemId,
      client
    );

    if (!catalogItem || !catalogItem.isActive) {
      throw new CatalogItemUnavailableError(
        'The selected catalog item is no longer available.'
      );
    }

    const priceSnapshot = catalogItem.usdAmountVo;

    // 2. Transaction execution
    const executePlacement = async (
      tx: DbExecutor
    ): Promise<Omit<PlaceOrderResult, 'adminNotifications'>> => {
      // 2a. Lock wallet row
      const wallet = await this.walletRepo.findByUserIdForUpdate(buyer.id, tx);
      if (!wallet) {
        throw new WalletNotFoundError(
          `Wallet not found for buyer ID ${buyer.id}`
        );
      }

      // 2b. Assert sufficient balance
      if (wallet.availableBalanceVo.lt(priceSnapshot)) {
        throw new InsufficientBalanceForOrderError(
          `Insufficient available balance (${wallet.availableBalance}) for item price (${catalogItem.usdPrice}).`
        );
      }

      // 2c. Create order at PLACED
      const order = await this.orderRepo.create(
        {
          userId: buyer.id,
          catalogItemId: catalogItem.id,
          usdPriceSnapshot: priceSnapshot,
          status: 'PLACED',
        },
        tx
      );

      // 2d. Record double-entry ledger transaction
      const { transaction: ledgerTx, entries: ledgerEntries } =
        await this.ledgerService.recordOrderSpend(
          {
            orderId: order.id,
            walletId: wallet.id,
            usdAmount: priceSnapshot,
          },
          tx
        );

      // 2e. Update wallet available balance
      const newBalance = wallet.availableBalanceVo.minus(priceSnapshot);
      const updatedWallet = await this.walletRepo.updateBalance(
        wallet.id,
        newBalance,
        tx
      );

      return {
        order,
        wallet: updatedWallet,
        ledgerTransaction: ledgerTx,
        ledgerEntries,
        catalogItem,
        buyer,
      };
    };

    let txResult: Omit<PlaceOrderResult, 'adminNotifications'>;
    if ('transaction' in client && typeof client.transaction === 'function') {
      txResult = await client.transaction(async (tx) => {
        return await executePlacement(tx);
      });
    } else {
      txResult = await executePlacement(client);
    }

    // 3. Dispatch admin push notifications (post-commit, fire-and-forget)
    let savedNotifications: OrderAdminNotification[] = [];

    if (dependencies?.notifyAdmins) {
      try {
        const notificationContext: OrderAdminNotificationContext = {
          order: txResult.order,
          catalogItem: txResult.catalogItem,
          buyer: txResult.buyer,
          postDebitBalance: txResult.wallet.availableBalance,
        };

        const payloads = await dependencies.notifyAdmins(notificationContext);
        if (payloads && payloads.length > 0) {
          savedNotifications = await this.orderRepo.createAdminNotifications(
            payloads.map((p) => ({
              orderId: txResult.order.id,
              adminTelegramId: p.adminTelegramId,
              chatId: p.chatId,
              messageId: p.messageId,
            })),
            client
          );
        }
      } catch (notifyErr) {
        console.error(
          `Failed to dispatch admin notifications for order ${txResult.order.id}:`,
          notifyErr
        );
      }
    }

    return {
      ...txResult,
      adminNotifications: savedNotifications,
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
  public async claimOrder(
    input: ClaimOrderInput,
    dependencies?: ClaimOrderDependencies,
    executor?: DbExecutor
  ): Promise<ClaimOrderResult> {
    const client = (executor ?? this.db ?? getDefaultDb()) as DbClient;

    const executeClaim = async (tx: DbExecutor): Promise<Order> => {
      // 1a. Lock order row
      const order = await this.orderRepo.findByIdForUpdate(input.orderId, tx);
      if (!order) {
        throw new OrderNotFoundError(
          `Order with ID ${input.orderId} not found.`
        );
      }

      // 1b. Assert status is PLACED
      if (order.status === 'PROCESSING') {
        throw new OrderAlreadyClaimedError(
          `Order ${order.id} has already been claimed by another admin.`
        );
      }

      if (order.status !== 'PLACED') {
        throw new InvalidOrderStatusError(
          `Order ${order.id} cannot be claimed because it is in status '${order.status}'.`
        );
      }

      // 1c. Update to PROCESSING
      const now = new Date();
      const updatedOrder = await this.orderRepo.updateStatus(
        order.id,
        'PROCESSING',
        {
          claimedByAdminTelegramId: BigInt(input.adminTelegramId),
          claimedAt: now,
          updatedAt: now,
        },
        tx
      );

      if (!updatedOrder) {
        throw new Error(`Failed to update order ${order.id} to PROCESSING`);
      }

      return updatedOrder;
    };

    let claimedOrder: Order;
    if ('transaction' in client && typeof client.transaction === 'function') {
      claimedOrder = await client.transaction(async (tx) => {
        return await executeClaim(tx);
      });
    } else {
      claimedOrder = await executeClaim(client);
    }

    // 2. Fetch admin notifications for this order
    const notifications = await this.orderRepo.getAdminNotifications(
      claimedOrder.id,
      client
    );

    // 3. Dispatch admin notification updates (outside transaction, fire-and-forget)
    if (dependencies?.updateAdminNotifications) {
      try {
        const context: ClaimOrderNotificationContext = {
          order: claimedOrder,
          notifications,
          claimedByAdminTelegramId: BigInt(input.adminTelegramId),
          claimedByAdminUsername: input.adminUsername,
        };
        await dependencies.updateAdminNotifications(context);
      } catch (notifyErr) {
        console.error(
          `Failed to update admin notifications for claimed order ${claimedOrder.id}:`,
          notifyErr
        );
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
  public async fulfilOrder(
    input: FulfilOrderInput,
    dependencies?: FulfilOrderDependencies,
    executor?: DbExecutor
  ): Promise<FulfilOrderResult> {
    const client = (executor ?? this.db ?? getDefaultDb()) as DbClient;
    const adminTelegramId = BigInt(input.adminTelegramId);
    const trimmedDeliveryContent = input.deliveryContent.trim();

    const executeFulfilment = async (
      tx: DbExecutor
    ): Promise<{ order: Order; buyer: Buyer }> => {
      // 1a. Lock order row
      const order = await this.orderRepo.findByIdForUpdate(input.orderId, tx);
      if (!order) {
        throw new OrderNotFoundError(
          `Order with ID ${input.orderId} not found.`
        );
      }

      // 1b. Assert caller is claiming admin
      if (
        order.claimedByAdminTelegramId === null ||
        order.claimedByAdminTelegramId !== adminTelegramId
      ) {
        throw new OrderNotClaimedByAdminError(
          `Admin ${input.adminTelegramId} did not claim order ${order.id} and cannot fulfil it.`
        );
      }

      // 1c. Assert status is PROCESSING
      if (order.status !== 'PROCESSING') {
        throw new InvalidOrderStatusError(
          `Order ${order.id} cannot be fulfilled because it is in status '${order.status}'.`
        );
      }

      // 1d. Update to FULFILLED
      const now = new Date();
      const updatedOrder = await this.orderRepo.updateStatus(
        order.id,
        'FULFILLED',
        {
          deliveryContent: trimmedDeliveryContent,
          fulfilledAt: now,
          updatedAt: now,
        },
        tx
      );

      if (!updatedOrder) {
        throw new Error(`Failed to update order ${order.id} to FULFILLED`);
      }

      // 1e. Resolve Buyer
      const buyer = await this.buyerRepo.findById(updatedOrder.userId, tx);
      if (!buyer) {
        throw new BuyerNotFoundError(
          `Buyer with ID ${updatedOrder.userId} not found for order ${updatedOrder.id}`
        );
      }

      return { order: updatedOrder, buyer };
    };

    let txResult: { order: Order; buyer: Buyer };
    if ('transaction' in client && typeof client.transaction === 'function') {
      txResult = await client.transaction(async (tx) => {
        return await executeFulfilment(tx);
      });
    } else {
      txResult = await executeFulfilment(client);
    }

    // 2. Fetch admin notifications for this order
    const notifications = await this.orderRepo.getAdminNotifications(
      txResult.order.id,
      client
    );

    // 3. Notify Buyer (outside transaction, fire-and-forget)
    if (dependencies?.notifyBuyer) {
      try {
        await dependencies.notifyBuyer({
          order: txResult.order,
          buyer: txResult.buyer,
          deliveryContent: trimmedDeliveryContent,
        });
      } catch (buyerNotifyErr) {
        console.error(
          `Failed to send delivery content notification to buyer ${txResult.buyer.id} for order ${txResult.order.id}:`,
          buyerNotifyErr
        );
      }
    }

    // 4. Update Admin notifications (outside transaction, fire-and-forget)
    if (dependencies?.updateAdminNotifications) {
      try {
        const context: FulfilOrderNotificationContext = {
          order: txResult.order,
          buyer: txResult.buyer,
          deliveryContent: trimmedDeliveryContent,
          notifications,
          adminTelegramId,
        };
        await dependencies.updateAdminNotifications(context);
      } catch (adminNotifyErr) {
        console.error(
          `Failed to update admin notifications for fulfilled order ${txResult.order.id}:`,
          adminNotifyErr
        );
      }
    }

    return {
      order: txResult.order,
      buyer: txResult.buyer,
      adminNotifications: notifications,
    };
  }

  /**
   * Retrieves an Order by ID.
   */
  public async findById(
    orderId: string,
    executor?: DbExecutor
  ): Promise<Order | null> {
    const client = executor ?? this.db ?? getDefaultDb();
    return await this.orderRepo.findById(orderId, client);
  }

  /**
   * Retrieves the most recent Order for a Buyer.
   */
  public async getLatestOrderByUserId(
    userId: string,
    executor?: DbExecutor
  ): Promise<Order | null> {
    const client = executor ?? this.db ?? getDefaultDb();
    return await this.orderRepo.findLatestByUserId(userId, client);
  }
}
