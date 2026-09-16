import type { Context } from "grammy";
import type { BuyerService } from "@/modules/buyer/buyer.service";
import type { WalletService } from "@/modules/wallet/wallet.service";
import type { OrderService } from "@/modules/order/order.service";
import type { TopUpService } from "@/modules/top-up/top-up.service";
import { buildProfileCardView } from "@/bot/buyer/keyboards/account.keyboards";
import { CannotCancelPendingTopUpError, NoActiveTopUpRequestError } from "@/modules/top-up/top-up.errors";

export interface AccountHandlerDependencies {
	buyerService: BuyerService;
	walletService: WalletService;
	orderService: OrderService;
	topUpService: TopUpService;
}

export interface BuyerCancelTopUpDependencies {
	buyerService: BuyerService;
	topUpService: TopUpService;
}

/**
 * Handles the /account Buyer command and '👤 حساب کاربری' menu button.
 * Displays the Profile Card with identity, balance, order breakdown, and active top-up alert.
 */
export async function handleAccountCommand(ctx: Context, deps: AccountHandlerDependencies): Promise<void> {
	const sender = ctx.from;
	if (!sender) {
		return;
	}

	const { buyerService, walletService, orderService, topUpService } = deps;

	const buyer = await buyerService.findByTelegramChatId(sender.id);
	if (!buyer) {
		await ctx.reply("شما هنوز در ربات ثبت نام نکرده‌اید. لطفاً با ارسال /start ثبت نام خود را انجام دهید.");
		return;
	}

	const [walletResult, orderCounts, activeTopUp] = await Promise.all([
		walletService.getBuyerWallet({ telegramChatId: sender.id }),
		orderService.getOrderCountBreakdown(sender.id),
		topUpService.getActiveTopUpRequest(buyer.id),
	]);

	const availableBalance = walletResult?.wallet.availableBalance ?? "0.00";

	const { messageText, keyboard } = buildProfileCardView({
		buyer,
		availableBalance,
		orderCounts,
		activeTopUp,
	});

	try {
		await ctx.reply(messageText, {
			parse_mode: "Markdown",
			reply_markup: keyboard,
		});
	} catch (replyErr: any) {
		if (replyErr?.message?.includes("can't parse entities")) {
			await ctx.reply(messageText.replace(/[*_`\\]/g, ""), {
				reply_markup: keyboard,
			});
		} else {
			throw replyErr;
		}
	}
}

/**
 * Handles the [❌ لغو درخواست] callback query on the Profile Card (account:topup:cancel).
 * Reuses the existing top-up cancel path.
 */
export async function handleBuyerCancelTopUpCallback(
	ctx: Context,
	deps: BuyerCancelTopUpDependencies,
): Promise<void> {
	const sender = ctx.from;
	if (!sender) {
		return;
	}

	const { buyerService, topUpService } = deps;

	const buyer = await buyerService.findByTelegramChatId(sender.id);
	if (!buyer) {
		return;
	}

	try {
		await topUpService.cancelTopUp({ userId: buyer.id });
		try {
			await ctx.answerCallbackQuery({
				text: "✅ درخواست افزایش موجودی با موفقیت لغو شد.",
			});
		} catch {}

		const successMsg = "درخواست افزایش موجودی شما با موفقیت لغو شد.";
		try {
			await ctx.editMessageText(successMsg);
		} catch {
			await ctx.reply(successMsg);
		}
	} catch (err: any) {
		if (err instanceof CannotCancelPendingTopUpError) {
			try {
				await ctx.answerCallbackQuery({
					text: "امکان لغو این درخواست وجود ندارد زیرا رسید پرداخت ارسال شده است. لطفاً منتظر بررسی ادمین باشید.",
					show_alert: true,
				});
			} catch {}
			return;
		}

		if (err instanceof NoActiveTopUpRequestError) {
			try {
				await ctx.answerCallbackQuery({
					text: "شما در حال حاضر هیچ درخواست افزایش موجودی فعالی برای لغو ندارید.",
					show_alert: true,
				});
			} catch {}
			return;
		}

		console.error("Failed to cancel top-up from Profile Card:", err);
		try {
			await ctx.answerCallbackQuery({
				text: "❌ خطایی در لغو درخواست رخ داد.",
				show_alert: true,
			});
		} catch {}
	}
}
