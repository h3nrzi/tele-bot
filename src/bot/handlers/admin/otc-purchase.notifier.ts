import { InlineKeyboard } from "grammy";
import type { IOtcPurchaseNotifier } from "@/modules/otc-purchase/interfaces/otc-purchase.notifier.interface";
import type { OtcPurchase } from "@/modules/otc-purchase/otc-purchase.entity";
import { resolveAdminIds } from "@/bot/middleware/admin.middleware";
import { formatIrr } from "@/core/shared/currency.utils";

export interface TelegramOtcPurchaseNotifierOptions {
	api: {
		sendMessage: (chatId: number | string, text: string, other?: Record<string, unknown>) => Promise<unknown>;
	};
	opsGroupId?: string | bigint | number | undefined;
	adminIds?: string | Set<bigint> | undefined;
}

export function getOtcRetryKeyboard(purchaseId: string): InlineKeyboard {
	return new InlineKeyboard().text("🔁 تلاش مجدد", `otc:retry:${purchaseId}`);
}

export function resolveOtcRecipients(options: {
	opsGroupId?: string | bigint | number | undefined;
	adminIds?: string | Set<bigint> | undefined;
}): Array<string | number> {
	const opsGroupId = options.opsGroupId ?? process.env.TELEGRAM_OPS_GROUP_ID;
	if (opsGroupId !== undefined && opsGroupId !== null && String(opsGroupId).trim() !== "") {
		return [String(opsGroupId).trim()];
	}

	const resolvedAdmins = resolveAdminIds(options.adminIds);
	return Array.from(resolvedAdmins).map((id) => Number(id));
}

export function formatOtcPurchaseSuccessMessage(purchase: OtcPurchase): string {
	const qty = purchase.wallexExecutedQty ?? purchase.usdtQuantity;
	const tmnSpent = purchase.wallexExecutedSum !== null ? formatIrr(purchase.wallexExecutedSum / 10n) : "-";
	const executedPriceTmn = purchase.wallexExecutedPrice !== null ? formatIrr(purchase.wallexExecutedPrice / 10n) : "-";
	const feeTmn = purchase.wallexFee !== null ? formatIrr(purchase.wallexFee / 10n) : "-";
	const orderId = purchase.wallexClientOrderId ?? "-";

	return (
		`✅ *خرید خودکار تتر از والکس با موفقیت انجام شد*\n\n` +
		`🔹 *تتر دریافتی:* \`${qty}\` USDT\n` +
		`🔹 *مبلغ پرداختی:* \`${tmnSpent}\` تومان\n` +
		`🔹 *نرخ خرید:* \`${executedPriceTmn}\` تومان\n` +
		`🔹 *کارمزد صرافی:* \`${feeTmn}\` تومان\n` +
		`🔹 *شناسه سفارش والکس:* \`${orderId}\`\n` +
		`🔹 *شناسه درخواست شارژ:* \`${purchase.topUpRequestId}\``
	);
}

export function escapeMarkdown(text: string): string {
	return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

export function formatOtcPurchaseFailureMessage(purchase: OtcPurchase, error?: string): string {
	const reason = error ?? purchase.errorMessage ?? "نامشخص";
	const escapedReason = escapeMarkdown(reason);

	return (
		`❌ *خطا در خرید خودکار تتر از والکس*\n\n` +
		`🔹 *مقدار درخواستی:* \`${purchase.usdtQuantity}\` USDT\n` +
		`🔹 *شناسه درخواست شارژ:* \`${purchase.topUpRequestId}\`\n` +
		`🔹 *شناسه عملیات:* \`${purchase.id}\`\n` +
		`🔹 *علت خطا:* ${escapedReason}\n\n` +
		`جهت تلاش مجدد پس از بررسی موجودی حساب والکس، دکمه زیر را فشار دهید.`
	);
}

export class TelegramOtcPurchaseNotifier implements IOtcPurchaseNotifier {
	private readonly api: TelegramOtcPurchaseNotifierOptions["api"];
	private readonly opsGroupId?: string | bigint | number | undefined;
	private readonly adminIds?: string | Set<bigint> | undefined;

	constructor(options: TelegramOtcPurchaseNotifierOptions) {
		this.api = options.api;
		this.opsGroupId = options.opsGroupId;
		this.adminIds = options.adminIds;
	}

	public async notifySuccess(purchase: OtcPurchase): Promise<void> {
		const messageText = formatOtcPurchaseSuccessMessage(purchase);
		await this.dispatchToRecipients(messageText);
	}

	public async notifyFailure(purchase: OtcPurchase, error?: string): Promise<void> {
		const messageText = formatOtcPurchaseFailureMessage(purchase, error);
		const keyboard = getOtcRetryKeyboard(purchase.id);
		await this.dispatchToRecipients(messageText, keyboard);
	}

	private async dispatchToRecipients(messageText: string, replyMarkup?: InlineKeyboard): Promise<void> {
		const recipients = resolveOtcRecipients({
			opsGroupId: this.opsGroupId,
			adminIds: this.adminIds,
		});

		if (recipients.length === 0) {
			console.warn("No recipients configured for OTC purchase notification.");
			return;
		}

		const options: Record<string, unknown> = {
			parse_mode: "Markdown",
		};
		if (replyMarkup) {
			options.reply_markup = replyMarkup;
		}

		for (const recipient of recipients) {
			try {
				await this.api.sendMessage(recipient, messageText, options);
			} catch (err) {
				console.error(`Failed to send OTC notification to ${recipient}:`, err);
			}
		}
	}
}
