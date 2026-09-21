import { InlineKeyboard } from "grammy";
import { isCancelCommand } from "@/core/shared/telegram.utils";
import type {
	BuyerRequirementContext,
	IBuyerRequirementStrategy,
	RequirementCollectionOutcome,
} from "@/bot/buyer/requirement-strategy/requirement-strategy.interface";

const REGION_FLAG_MAP: Record<string, string> = {
	de: "🇩🇪 آلمان (de)",
	nl: "🇳🇱 هلند (nl)",
	fi: "🇫🇮 فنلاند (fi)",
	us: "🇺🇸 آمریکا (us)",
	gb: "🇬🇧 انگلیس (gb)",
	fr: "🇫🇷 فرانسه (fr)",
	tr: "🇹🇷 ترکیه (tr)",
};

/**
 * Requirement collection strategy for CONFIG_VPN items.
 * Renders an inline keyboard of allowed regions from the catalog item's requirementConfig.
 */
export class ConfigVpnRequirementStrategy implements IBuyerRequirementStrategy {
	public async collect(context: BuyerRequirementContext): Promise<RequirementCollectionOutcome> {
		const { conversation, ctx, catalogItem } = context;

		const config = catalogItem.requirementConfig as { allowedRegions?: string[] } | null | undefined;
		const allowedRegions: string[] =
			config && Array.isArray(config.allowedRegions) && config.allowedRegions.length > 0
				? config.allowedRegions
				: ["de", "nl", "us"];

		const keyboard = new InlineKeyboard();
		for (const region of allowedRegions) {
			const label = REGION_FLAG_MAP[region.toLowerCase()] ?? region.toUpperCase();
			keyboard.text(label, `req:vpn:${region}`).row();
		}
		keyboard.text("❌ انصراف", "flow:cancel");

		await ctx.reply("🌐 لطفاً منطقه سرور مورد نظر خود را برای اتصال انتخاب کنید:", {
			reply_markup: keyboard,
		});

		let selectedRegion = "";
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

			if (callbackData && callbackData.startsWith("req:vpn:")) {
				const region = callbackData.replace(/^req:vpn:/, "");
				if (allowedRegions.some((r) => r.toLowerCase() === region.toLowerCase())) {
					selectedRegion = region;
					if (inputCtx.callbackQuery) {
						try {
							await inputCtx.answerCallbackQuery();
						} catch {}
					}
					break;
				}
			}

			// Also allow typing the region code/name if matching allowedRegions
			if (text) {
				const matched = allowedRegions.find((r) => r.toLowerCase() === text.toLowerCase());
				if (matched) {
					selectedRegion = matched;
					break;
				}
			}

			await inputCtx.reply("❌ لطفاً یکی از مناطق مجاز را از طریق دکمه‌های زیر انتخاب کنید:", {
				reply_markup: keyboard,
			});
		}

		return {
			buyerInputs: {
				region: selectedRegion,
			},
			displayMetadata: {
				"🌐 منطقه سرور": REGION_FLAG_MAP[selectedRegion.toLowerCase()] ?? selectedRegion,
			},
		};
	}
}
