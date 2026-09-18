import { InlineKeyboard } from "grammy";
import { isCancelCommand } from "@/core/shared/telegram.utils";
import type {
	BuyerRequirementContext,
	IBuyerRequirementStrategy,
	RequirementCollectionOutcome,
} from "@/bot/buyer/requirement-strategy/requirement-strategy.interface";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Requirement collection strategy for DIRECT_ACCOUNT items (e.g. Spotify, ChatGPT).
 * Collects email and password, purges password message from chat history,
 * and encrypts the password at rest using CredentialCryptoService.
 */
export class DirectAccountRequirementStrategy implements IBuyerRequirementStrategy {
	public async collect(context: BuyerRequirementContext): Promise<RequirementCollectionOutcome> {
		const { conversation, ctx, cryptoService } = context;

		// 1. Prompt for email
		await ctx.reply(
			"📧 لطفاً آدرس ایمیل اکانت خود را ارسال کنید:\n\n" +
				"این ایمیل جهت فعال‌سازی خدمت روی حساب کاربری شما استفاده خواهد شد.",
			{
				reply_markup: new InlineKeyboard().text("❌ انصراف", "flow:cancel"),
			},
		);

		let email = "";
		while (true) {
			const emailCtx = await conversation.wait();
			const text = emailCtx.message?.text?.trim() ?? "";
			const callbackData = emailCtx.callbackQuery?.data;

			if (callbackData === "flow:cancel" || isCancelCommand(text)) {
				if (emailCtx.callbackQuery) {
					try {
						await emailCtx.answerCallbackQuery();
					} catch {}
				}
				return "CANCEL";
			}

			if (EMAIL_REGEX.test(text)) {
				email = text.toLowerCase();
				break;
			}

			await emailCtx.reply(
				"❌ فرمت ایمیل وارد شده نامعتبر است.\n\n" +
					"لطفاً یک آدرس ایمیل معتبر (مانند user@example.com) ارسال کنید:",
				{
					reply_markup: new InlineKeyboard().text("❌ انصراف", "flow:cancel"),
				},
			);
		}

		// 2. Prompt for password
		await ctx.reply(
			"🔑 لطفاً رمز عبور اکانت خود را ارسال کنید:\n\n" +
				"⚠️ جهت امنیت شما، پیام حاوی رمز عبور بلافاصله پس از دریافت از تاریخچه چت پاک خواهد شد.",
			{
				reply_markup: new InlineKeyboard().text("❌ انصراف", "flow:cancel"),
			},
		);

		let rawPassword = "";
		while (true) {
			const pwCtx = await conversation.wait();
			const text = pwCtx.message?.text ?? "";
			const callbackData = pwCtx.callbackQuery?.data;

			if (callbackData === "flow:cancel" || isCancelCommand(text)) {
				if (pwCtx.callbackQuery) {
					try {
						await pwCtx.answerCallbackQuery();
					} catch {}
				}
				return "CANCEL";
			}

			// Immediately delete the raw password message if it's a message
			if (pwCtx.message) {
				try {
					if (typeof pwCtx.deleteMessage === "function") {
						await pwCtx.deleteMessage();
					} else if (pwCtx.chat?.id && pwCtx.message.message_id) {
						await pwCtx.api.deleteMessage(pwCtx.chat.id, pwCtx.message.message_id);
					}
				} catch (delErr) {
					console.warn("Failed to delete raw password message:", delErr);
				}
			}

			if (text.trim().length > 0) {
				rawPassword = text;
				break;
			}

			await pwCtx.reply("❌ رمز عبور نمی‌تواند خالی باشد. لطفاً رمز عبور خود را وارد کنید:", {
				reply_markup: new InlineKeyboard().text("❌ انصراف", "flow:cancel"),
			});
		}

		// Encrypt password at rest
		const encryptedPassword = cryptoService.encrypt(rawPassword);

		return {
			buyerInputs: {
				email,
				password: encryptedPassword,
			},
			displayMetadata: {
				"📧 ایمیل": email,
				"🔑 رمز عبور": "••••••••",
			},
		};
	}
}
