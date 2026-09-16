import { InlineKeyboard, type Context } from "grammy";
import type { BotContext } from "@/bot/context";
import type { ExchangeRateService } from "@/modules/exchange-rate/services/exchange-rate.service";
import type { ExchangeRateConfigService } from "@/modules/exchange-rate/services/exchange-rate-config.service";
import { formatIrr } from "@/core/shared/currency.utils";
import {
	SETRATE_CONVERSATION_ID,
	cleanRateInput,
	isValidRateInput,
} from "@/bot/admin/conversations/set-rate.conversation";

/**
 * Handles the /setrate command for Admins.
 * If Auto-Sync mode is active, blocks manual rate changes with a warning and switch-to-MANUAL button.
 * If an argument is provided, updates the rate immediately.
 * Otherwise enters the interactive setrate conversation.
 */
export async function handleSetRate(
	ctx: Context | BotContext,
	service: ExchangeRateService,
	configService?: ExchangeRateConfigService,
): Promise<void> {
	const sender = ctx.from;
	if (!sender) {
		return;
	}

	// Guard: If AUTO_SYNC mode is active, block manual rate setting
	if (configService) {
		const config = await configService.getConfig();
		if (config.isAutoSync()) {
			const inlineKeyboard = new InlineKeyboard()
				.text("🔄 تغییر حالت به دستی", "ratemode:switch:MANUAL")
				.row()
				.text("❌ انصراف", "flow:cancel");

			await ctx.reply(
				"⚠️ *تنظیم دستی نرخ در حالت خودکار امکان‌پذیر نیست.*\n\n" +
					"سیستم در حال حاضر روی حالت نرخ خودکار (Auto-Sync) تنظیم شده است و نرخ‌ها مستقیماً بر اساس والکس به‌روزرسانی می‌شوند.\n" +
					"برای تنظیم دستی نرخ، ابتدا باید حالت نرخ ارز را به دستی (MANUAL) تغییر دهید.",
				{
					parse_mode: "Markdown",
					reply_markup: inlineKeyboard,
				},
			);
			return;
		}
	}

	let rawRateInput: string | undefined;
	const messageText = ctx.message?.text ?? "";
	if (messageText.startsWith("/setrate")) {
		const match = messageText.match(/^\/setrate(?:\s+(.*))?$/);
		rawRateInput = match?.[1]?.trim();
	} else if (typeof ctx.match === "string" && ctx.match.trim() !== "" && !ctx.match.includes("تنظیم نرخ ارز")) {
		rawRateInput = ctx.match.trim();
	}

	// If no argument is provided, enter the conversation if available
	if (!rawRateInput) {
		if ("conversation" in ctx && typeof (ctx as BotContext).conversation?.enter === "function") {
			await (ctx as BotContext).conversation.enter(SETRATE_CONVERSATION_ID);
			return;
		}

		const usageErrorMsg =
			`❌ فرمت نرخ وارد شده نامعتبر است.\n` + `لطفاً یک عدد صحیح مثبت به ریال وارد کنید.\n` + `مثال: /setrate 620000`;
		await ctx.reply(usageErrorMsg);
		return;
	}

	const usageErrorMsg =
		`❌ فرمت نرخ وارد شده نامعتبر است.\n` + `لطفاً یک عدد صحیح مثبت به ریال وارد کنید.\n` + `مثال: /setrate 620000`;

	if (!isValidRateInput(rawRateInput)) {
		await ctx.reply(usageErrorMsg);
		return;
	}

	const cleaned = cleanRateInput(rawRateInput);
	const irrPerUsd = BigInt(cleaned);

	const updatedRate = await service.setRate(sender.id, irrPerUsd);

	await ctx.reply(`✅ نرخ جدید با موفقیت تنظیم شد:\nهر ۱ دلار آمریکا = ${formatIrr(updatedRate.irrPerUsd)} ریال`);
}
