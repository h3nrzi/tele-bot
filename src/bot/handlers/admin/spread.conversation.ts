import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import Decimal from "decimal.js";
import type { BotConversation } from "@/bot/context";
import type { ExchangeRateConfigService } from "@/modules/exchange-rate/exchange-rate-config.service";
import { isCancelCommand } from "@/core/shared/telegram.utils";
import { formatIrr } from "@/core/shared/currency.utils";

export type SpreadConversation = BotConversation;
export const SPREAD_CONVERSATION_ID = "spread";

/**
 * Cleans a spread input string by normalizing Persian/Arabic digits, removing %, commas, and whitespace.
 */
export function cleanSpreadInput(text: string): string {
	const persianDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
	const arabicDigits = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

	let cleaned = text.trim();
	for (let i = 0; i < 10; i++) {
		const p = persianDigits[i];
		const a = arabicDigits[i];
		if (p) cleaned = cleaned.replaceAll(p, String(i));
		if (a) cleaned = cleaned.replaceAll(a, String(i));
	}

	// Also replace Persian percent sign ٪ and standard %
	return cleaned.replace(/[%٪,\s_]/g, "");
}

/**
 * Validates that input is a valid spread percentage between 0 and 10 (inclusive) with at most 2 decimal places.
 */
export function isValidSpreadInput(text: string): boolean {
	const cleaned = cleanSpreadInput(text);
	if (!cleaned || !/^\d+(\.\d{1,2})?$/.test(cleaned)) {
		return false;
	}
	try {
		const dec = new Decimal(cleaned);
		return !dec.isNaN() && dec.gte(0) && dec.lte(10);
	} catch {
		return false;
	}
}

/**
 * Calculates a concrete calculation example for confirmation display.
 * E.g., if Wallex OTC rate is 90,500 TMN, buyer pays 91,858 TMN per USDT with 1.50% spread.
 */
export function calculateSpreadExample(
	spreadPercent: number | string,
	baseTmn = 90500,
): { baseTmn: number; buyerPaysTmn: number; diffTmn: number } {
	const base = new Decimal(baseTmn);
	const spread = new Decimal(spreadPercent);
	const multiplier = new Decimal(1).plus(spread.div(100));
	const buyerPays = base.times(multiplier).round();
	const diff = buyerPays.minus(base);

	return {
		baseTmn: base.toNumber(),
		buyerPaysTmn: buyerPays.toNumber(),
		diffTmn: diff.toNumber(),
	};
}

/**
 * Creates the grammY conversation for Admin spread percentage setup flow.
 */
export function createSpreadConversation(configService: ExchangeRateConfigService) {
	return async function spreadConversation(conversation: SpreadConversation, ctx: Context): Promise<void> {
		const sender = ctx.from;
		if (!sender) {
			return;
		}

		if (ctx.callbackQuery) {
			try {
				await ctx.answerCallbackQuery();
			} catch {}
		}

		const currentConfig = await conversation.external(() => configService.getConfig());

		await ctx.reply(
			`📊 *تنظیم اسپرد (Spread)*\n\n` +
				`اسپرد درصدی است که روی نرخ خرید والکس اعمال می‌شود تا هزینه‌ها و نوسانات پوشش داده شوند (بین ۰ تا ۱۰ درصد).\n\n` +
				`اسپرد فعلی: *${currentConfig.spreadPercent}%*\n\n` +
				`لطفاً درصد اسپرد جدید را وارد کنید (مثال: 1.5 یا 2):`,
			{
				parse_mode: "Markdown",
				reply_markup: new InlineKeyboard().text("❌ انصراف", "flow:cancel"),
			},
		);

		while (true) {
			const nextCtx = await conversation.wait();
			const text = nextCtx.message?.text ?? "";
			const cb = nextCtx.callbackQuery?.data;

			if (cb === "flow:cancel" || isCancelCommand(text)) {
				if (nextCtx.callbackQuery) {
					try {
						await nextCtx.answerCallbackQuery();
					} catch {}
				}
				await nextCtx.reply("❌ عملیات تنظیم اسپرد لغو شد.");
				return;
			}

			if (isValidSpreadInput(text)) {
				const cleaned = cleanSpreadInput(text);
				const dec = new Decimal(cleaned);
				const spreadStr = dec.toFixed(2);

				await conversation.external(async () => {
					return await configService.updateSpread(spreadStr, sender.id);
				});

				const example = calculateSpreadExample(spreadStr);

				await nextCtx.reply(
					`✅ *اسپرد با موفقیت روی ${spreadStr}% تنظیم شد.*\n\n` +
						`📊 *مثال محاسبه:*\n` +
						`اگر نرخ خرید والکس ${formatIrr(example.baseTmn)} تومان باشد، ` +
						`خریدار با احتساب ${spreadStr}% اسپرد، مبلغ ${formatIrr(example.buyerPaysTmn)} تومان ` +
						`به ازای هر تتر پرداخت خواهد کرد.`,
					{
						parse_mode: "Markdown",
					},
				);
				return;
			}

			await nextCtx.reply(
				"❌ *درصد وارد شده نامعتبر است.*\n\n" + "لطفاً یک عدد معتبر بین ۰ تا ۱۰ وارد کنید (مثال: 1.5 یا 2):",
				{
					parse_mode: "Markdown",
					reply_markup: new InlineKeyboard().text("❌ انصراف", "flow:cancel"),
				},
			);
		}
	};
}
