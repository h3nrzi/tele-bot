import { InlineKeyboard } from "grammy";
import type { Buyer } from "@/modules/buyer/buyer.entity";
import type { TopUpRequest } from "@/modules/top-up/top-up-request.entity";
import type { OrderCountBreakdownResult } from "@/modules/order/dtos/order.dto";
import { formatUsd, formatIrr } from "@/core/shared/currency.utils";
import { formatPersianDate } from "@/core/shared/date.utils";
import { escapeMarkdown } from "@/core/shared/telegram.utils";

export const ACCOUNT_CALLBACKS = {
	ORDERS: "account:orders",
	TRANSACTIONS: "account:transactions",
	TOPUP_CANCEL: "account:topup:cancel",
} as const;

export interface ProfileCardViewParams {
	buyer: Buyer;
	availableBalance: string;
	orderCounts: OrderCountBreakdownResult;
	activeTopUp?: TopUpRequest | null;
}

export interface ProfileCardViewResult {
	messageText: string;
	keyboard: InlineKeyboard;
}

/**
 * Builds the text and inline keyboard for the Buyer Profile Card.
 */
export function buildProfileCardView(params: ProfileCardViewParams): ProfileCardViewResult {
	const { buyer, availableBalance, orderCounts, activeTopUp } = params;

	const displayName = buyer.getDisplayName();
	const rawId = buyer.telegramChatId.toString();
	const registrationDate = formatPersianDate(buyer.createdAt);
	const balanceFormatted = formatUsd(availableBalance);

	let messageText =
		`👤 *حساب کاربری*\n\n` +
		`🆔 شناسه تلگرام: \`${rawId}\`\n` +
		`👤 نام کاربری: ${escapeMarkdown(displayName)}\n` +
		`📅 تاریخ عضویت: ${registrationDate}\n` +
		`💰 موجودی قابل استفاده: ${balanceFormatted}\n\n` +
		`📊 *خلاصه وضعیت سفارش‌ها:*\n` +
		`✅ تکمیل شده: ${orderCounts.fulfilled}\n` +
		`⏳ در حال پردازش: ${orderCounts.inProgress}\n` +
		`❌ لغو شده: ${orderCounts.cancelled}`;

	if (activeTopUp) {
		if (activeTopUp.status === "INITIATED") {
			messageText +=
				`\n\n⚠️ *درخواست افزایش موجودی در انتظار پرداخت:*\n` +
				`💵 مبلغ: ${formatUsd(activeTopUp.usdAmount)} (${formatIrr(activeTopUp.irrAmount)} ریال)\n` +
				`لطفاً پس از واریز به کارت، عکس رسید پرداخت بانکی خود را ارسال نمایید.`;
		} else if (activeTopUp.status === "PENDING") {
			messageText +=
				`\n\n⏳ *درخواست افزایش موجودی در انتظار بررسی:*\n` +
				`💵 مبلغ: ${formatUsd(activeTopUp.usdAmount)} (${formatIrr(activeTopUp.irrAmount)} ریال)\n` +
				`رسید پرداخت شما ارسال شده و در حال بررسی توسط ادمین است.`;
		}
	}

	const keyboard = new InlineKeyboard()
		.text("📦 تاریخچه سفارش‌ها", ACCOUNT_CALLBACKS.ORDERS)
		.row()
		.text("💳 تاریخچه تراکنش‌ها", ACCOUNT_CALLBACKS.TRANSACTIONS);

	if (activeTopUp && activeTopUp.status === "PENDING") {
		keyboard.row().text("❌ لغو درخواست", ACCOUNT_CALLBACKS.TOPUP_CANCEL);
	}

	return {
		messageText,
		keyboard,
	};
}
