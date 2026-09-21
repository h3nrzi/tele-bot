import { InlineKeyboard } from "grammy";
import { isCancelCommand } from "@/core/shared/telegram.utils";
import type {
	BuyerRequirementContext,
	IBuyerRequirementStrategy,
	RequirementCollectionOutcome,
} from "@/bot/buyer/requirement-strategy/requirement-strategy.interface";

const USERNAME_OR_ID_REGEX = /^(@[a-zA-Z0-9_]{3,32}|[a-zA-Z0-9_]{3,32}|\d{4,16})$/;

/**
 * Requirement collection strategy for IDENTITY_HANDLE items (e.g. Telegram Premium Gift).
 * Prompts for recipient @username or numeric Telegram ID with format validation.
 */
export class IdentityHandleRequirementStrategy implements IBuyerRequirementStrategy {
	public async collect(context: BuyerRequirementContext): Promise<RequirementCollectionOutcome> {
		const { conversation, ctx } = context;

		await ctx.reply(
			"🆔 لطفاً نام کاربری (با @) یا شناسه عددی تلگرام مقصد را وارد کنید:\n\n" +
				"مثال: @username یا 123456789",
			{
				reply_markup: new InlineKeyboard().text("❌ انصراف", "flow:cancel"),
			},
		);

		let targetUsername = "";
		while (true) {
			const inputCtx = await conversation.wait();
			const text = inputCtx.message?.text?.trim() ?? "";
			const callbackData = inputCtx.callbackQuery?.data;

			if (callbackData === "flow:cancel" || isCancelCommand(text)) {
				if (inputCtx.callbackQuery) {
					try {
						await inputCtx.answerCallbackQuery();
					} catch {}
				}
				return "CANCEL";
			}

			if (USERNAME_OR_ID_REGEX.test(text)) {
				// Normalize: if alphanumeric without @ and not pure digits, prepend @
				if (/^[a-zA-Z][a-zA-Z0-9_]*$/.test(text)) {
					targetUsername = `@${text}`;
				} else {
					targetUsername = text;
				}
				break;
			}

			await inputCtx.reply(
				"❌ شناسه وارد شده نامعتبر است.\n\n" +
					"لطفاً یک نام کاربری معتبر (مانند username@) یا شناسه عددی تلگرام ارسال کنید:",
				{
					reply_markup: new InlineKeyboard().text("❌ انصراف", "flow:cancel"),
				},
			);
		}

		return {
			buyerInputs: {
				targetUsername,
			},
			displayMetadata: {
				"👤 شناسه / نام کاربری مقصد": targetUsername,
			},
		};
	}
}
