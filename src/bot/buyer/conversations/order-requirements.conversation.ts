import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import Decimal from "decimal.js";
import type { BotConversation } from "@/bot/context";
import type { OrderService } from "@/modules/order/order.service";
import type { CatalogService } from "@/modules/catalog/catalog.service";
import type { BuyerService } from "@/modules/buyer/buyer.service";
import type { WalletService } from "@/modules/wallet/wallet.service";
import type { ICredentialCryptoService } from "@/core/crypto/credential-crypto.interface";
import { formatUsd } from "@/core/shared/currency.utils";
import { isCancelCommand } from "@/core/shared/telegram.utils";
import { InsufficientBalanceForOrderError, CatalogItemUnavailableError } from "@/modules/order/order.errors";
import { getBuyerRequirementStrategy } from "@/bot/buyer/requirement-strategy";

export type CollectOrderRequirementsConversation = BotConversation;
export const COLLECT_ORDER_REQUIREMENTS_CONVERSATION_ID = "collect_order_requirements";

/**
 * Creates the grammY conversation for dynamic buyer requirements collection and atomic order placement.
 * 1. Checks item availability and validates buyer balance.
 * 2. Runs the corresponding IBuyerRequirementStrategy (collects email/password, handles, or server region).
 * 3. Shows order confirmation summary with masked credentials (••••••••) and balance breakdown.
 * 4. Atomically places order, debits wallet, creates ledger entries, and stores encrypted buyer inputs.
 */
export function createCollectOrderRequirementsConversation(
	orderService: OrderService,
	catalogService: CatalogService,
	buyerService: BuyerService,
	walletService: WalletService,
	cryptoService: ICredentialCryptoService,
) {
	return async function collectOrderRequirementsConversation(
		conversation: CollectOrderRequirementsConversation,
		ctx: Context,
	): Promise<void> {
		const sender = ctx.from;
		if (!sender) {
			return;
		}

		const callbackData = ctx.callbackQuery?.data;
		const match = callbackData?.match(/^shop:item:(.+)$/);
		if (!match || !match[1]) {
			return;
		}

		const itemId = match[1];

		if (ctx.callbackQuery) {
			try {
				await ctx.answerCallbackQuery();
			} catch {}
		}

		// 1. Fetch item and buyer wallet
		const { itemData, availableBalance } = await conversation.external(async () => {
			const fetchedItem = await catalogService.findById(itemId);
			const { wallet: registeredWallet } = await buyerService.register({
				telegramChatId: sender.id,
				telegramUsername: sender.username ?? null,
			});
			return {
				itemData: fetchedItem
					? {
							id: fetchedItem.id,
							name: fetchedItem.name,
							description: fetchedItem.description,
							usdPrice: fetchedItem.usdPrice,
							catalogType: fetchedItem.catalogType,
							fulfillmentStrategy: fetchedItem.fulfillmentStrategy,
							requirementConfig: fetchedItem.requirementConfig,
							isActive: fetchedItem.isActive,
						}
					: null,
				availableBalance: registeredWallet.availableBalance,
			};
		});

		if (!itemData || !itemData.isActive) {
			await ctx.reply("⚠️ این خدمت در دسترس نیست یا غیرفعال شده است.");
			return;
		}

		// Fail-fast balance check inside conversation
		const priceDec = new Decimal(itemData.usdPrice);
		const balanceDec = new Decimal(availableBalance);
		if (balanceDec.lt(priceDec)) {
			await ctx.reply(
				"⚠️ موجودی کیف پول شما برای خرید این خدمت کافی نیست. لطفاً ابتدا از طریق دستور /topup موجودی خود را افزایش دهید.",
			);
			return;
		}

		// 2. Delegate to requirement strategy
		const strategy = getBuyerRequirementStrategy(itemData.catalogType);
		const outcome = await strategy.collect({
			conversation,
			ctx,
			catalogItem: itemData,
			cryptoService,
		});

		if (outcome === "CANCEL") {
			await ctx.reply("❌ عملیات خرید لغو شد.");
			return;
		}

		// 3. Refresh balance and show confirmation prompt
		const freshBalance = await conversation.external(async () => {
			const res = await walletService.getBuyerWallet({ telegramChatId: sender.id });
			return res?.wallet.availableBalance ?? availableBalance;
		});

		const currentBalanceDec = new Decimal(freshBalance);
		if (currentBalanceDec.lt(priceDec)) {
			await ctx.reply(
				"⚠️ موجودی کیف پول شما برای خرید این خدمت کافی نیست. لطفاً ابتدا از طریق دستور /topup موجودی خود را افزایش دهید.",
			);
			return;
		}

		const remainingBalance = currentBalanceDec.minus(priceDec);

		let metadataLines = "";
		if (outcome.displayMetadata && Object.keys(outcome.displayMetadata).length > 0) {
			metadataLines =
				"\n" +
				Object.entries(outcome.displayMetadata)
					.map(([k, v]) => `${k}: ${v}`)
					.join("\n") +
				"\n";
		}

		const descriptionLine = itemData.description ? `📝 توضیحات: ${itemData.description}\n` : "";
		const confirmationMessage =
			`🛒 پیش‌فاکتور خرید خدمت\n\n` +
			`📦 نام خدمت: ${itemData.name}\n` +
			descriptionLine +
			`💵 مبلغ سفارش: ${formatUsd(itemData.usdPrice)}\n` +
			`💰 موجودی فعلی: ${formatUsd(currentBalanceDec)}\n` +
			`💳 موجودی پس از کسر: ${formatUsd(remainingBalance)}\n` +
			metadataLines +
			`\nآیا از ثبت این سفارش اطمینان دارید؟`;

		const confirmationKeyboard = new InlineKeyboard()
			.text("✓ تایید خرید", "req:confirm")
			.text("✗ انصراف", "flow:cancel");

		await ctx.reply(confirmationMessage, {
			reply_markup: confirmationKeyboard,
		});

		// 4. Wait for final confirmation or cancellation
		const confirmCtx = await conversation.wait();
		const confirmText = confirmCtx.message?.text?.trim() ?? "";
		const confirmCallback = confirmCtx.callbackQuery?.data;

		if (
			confirmCallback === "flow:cancel" ||
			confirmCallback === "shop:cancel" ||
			isCancelCommand(confirmText)
		) {
			if (confirmCtx.callbackQuery) {
				try {
					await confirmCtx.answerCallbackQuery();
				} catch {}
			}
			await confirmCtx.reply("❌ عملیات خرید لغو شد.");
			return;
		}

		const isConfirmed =
			confirmCallback === "req:confirm" ||
			confirmCallback?.startsWith("shop:confirm") ||
			confirmText === "تایید" ||
			confirmText === "بله" ||
			confirmText.toLowerCase() === "confirm" ||
			confirmText.toLowerCase() === "yes";

		if (!isConfirmed) {
			await confirmCtx.reply("❌ عملیات خرید لغو شد.");
			return;
		}

		if (confirmCtx.callbackQuery) {
			try {
				await confirmCtx.answerCallbackQuery();
			} catch {}
		}

		// 5. Commit atomic placement
		try {
			const placementResult = await conversation.external(async () => {
				const res = await orderService.placeOrder({
					telegramChatId: sender.id,
					catalogItemId: itemData.id,
					buyerInputs: outcome.buyerInputs,
				});
				return {
					orderId: res.order.id,
					catalogItemName: res.catalogItem.name,
					usdPriceSnapshot: res.order.usdPriceSnapshot,
					remainingBalance: res.wallet.availableBalance,
				};
			});

			const buyerSuccessMessage =
				`✅ سفارش شما با موفقیت ثبت شد!\n\n` +
				`🆔 شناسه سفارش: #${placementResult.orderId}\n` +
				`🛍️ خدمت: ${placementResult.catalogItemName}\n` +
				`💵 مبلغ کسر شده: ${formatUsd(placementResult.usdPriceSnapshot)}\n` +
				`💰 موجودی باقی‌مانده: ${formatUsd(placementResult.remainingBalance)}\n\n` +
				`سفارش شما در صف بررسی ادمین‌ها قرار گرفت. مشخصات تحویل پس از پردازش از طریق همین ربات برای شما ارسال خواهد شد.`;

			try {
				if (confirmCtx.callbackQuery) {
					await confirmCtx.editMessageText(buyerSuccessMessage, {
						reply_markup: new InlineKeyboard(),
					});
				} else {
					await confirmCtx.reply(buyerSuccessMessage);
				}
			} catch {
				await confirmCtx.reply(buyerSuccessMessage);
			}
		} catch (err: any) {
			if (err instanceof InsufficientBalanceForOrderError) {
				await confirmCtx.reply(
					"⚠️ موجودی کیف پول شما برای خرید این خدمت کافی نیست. لطفاً ابتدا از طریق دستور /topup موجودی خود را افزایش دهید.",
				);
				return;
			}
			if (err instanceof CatalogItemUnavailableError) {
				await confirmCtx.reply("⚠️ این خدمت دیگر در دسترس نیست یا غیرفعال شده است.");
				return;
			}
			console.error("Failed to place order in conversation:", err);
			await confirmCtx.reply("❌ خطایی در ثبت سفارش رخ داد. لطفاً بعداً دوباره تلاش کنید.");
		}
	};
}
