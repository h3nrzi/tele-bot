import { InlineKeyboard } from "grammy";
import type { Buyer } from "@/modules/buyer/buyer.entity";
import type { TopUpRequest } from "@/modules/top-up/top-up-request.entity";
import type { Order, OrderStatus } from "@/modules/order/order.entity";
import type { CatalogItem } from "@/modules/catalog/catalog.entity";
import type { OrderCountBreakdownResult, RecentOrderWithCatalogItem } from "@/modules/order/dtos/order.dto";
import type { RecentWalletTransactionEntry } from "@/modules/ledger/ledger.repository.interface";
import { formatUsd, formatIrr } from "@/core/shared/currency.utils";
import { formatPersianDate, formatPersianDateTime } from "@/core/shared/date.utils";
import { escapeMarkdown } from "@/core/shared/telegram.utils";
import { ORDER_STATUS_LABELS } from "@/bot/buyer/keyboards/order.keyboards";
import { ORDER_REJECTION_CATEGORIES, type OrderRejectionCategoryCode } from "@/bot/admin/keyboards/order.keyboards";

export const ACCOUNT_CALLBACKS = {
	ORDERS: "account:orders",
	ORDER_PREFIX: "account:order:",
	TRANSACTIONS: "account:transactions",
	TOPUP_CANCEL: "account:topup:cancel",
	PROFILE: "account:profile",
} as const;

export const ACCOUNT_ORDER_CALLBACK_REGEX = new RegExp(`^${ACCOUNT_CALLBACKS.ORDER_PREFIX}(.+)$`);

export const ORDER_STATUS_EMOJIS: Record<OrderStatus, string> = {
	PLACED: "⏳",
	PROCESSING: "⏳",
	FULFILLED: "✅",
	REJECTED: "❌",
	CANCELLED: "❌",
};

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

export interface OrderHistoryListViewResult {
	messageText: string;
	keyboard: InlineKeyboard;
	isEmpty: boolean;
}

/**
 * Builds the text and inline keyboard for the 5-order history list view.
 */
export function buildOrderHistoryListView(orders: RecentOrderWithCatalogItem[]): OrderHistoryListViewResult {
	const keyboard = new InlineKeyboard();

	if (!orders || orders.length === 0) {
		const messageText =
			`📦 *تاریخچه سفارش‌ها*\n\n` +
			`شما تاکنون هیچ سفارشی ثبت نکرده‌اید.\n` +
			`برای مشاهده و خرید خدمات، لطفاً به بخش 🛍️ *فروشگاه خدمات* مراجعه کنید.`;

		keyboard.text("🔙 بازگشت به پروفایل", ACCOUNT_CALLBACKS.PROFILE);

		return {
			messageText,
			keyboard,
			isEmpty: true,
		};
	}

	const messageText = `📦 *تاریخچه سفارش‌های شما:*\n\nبرای مشاهده جزئیات هر سفارش، روی آن کلیک کنید:`;

	const displayOrders = orders.slice(0, 5);
	for (const item of displayOrders) {
		const emoji = ORDER_STATUS_EMOJIS[item.order.status] ?? "📦";
		const buttonText = `${emoji} ${item.catalogItemName}`;
		keyboard.text(buttonText, `${ACCOUNT_CALLBACKS.ORDER_PREFIX}${item.order.id}`).row();
	}

	keyboard.text("🔙 بازگشت به پروفایل", ACCOUNT_CALLBACKS.PROFILE);

	return {
		messageText,
		keyboard,
		isEmpty: false,
	};
}

export interface OrderDetailViewParams {
	order: Order;
	catalogItem?: CatalogItem | null;
}

export interface OrderDetailViewResult {
	messageText: string;
	keyboard: InlineKeyboard;
	hasCancelButton: boolean;
}

/**
 * Builds the text and inline keyboard for the order detail view in Account Hub.
 */
export function buildOrderDetailView(params: OrderDetailViewParams): OrderDetailViewResult {
	const { order, catalogItem } = params;

	const itemName = catalogItem ? catalogItem.name : "خدمت انتخابی";
	const statusLabel = ORDER_STATUS_LABELS[order.status] ?? order.status;

	let messageText =
		`📦 *جزئیات سفارش:*\n\n` +
		`🆔 شناسه سفارش: #${order.id}\n` +
		`🛍️ نام خدمت: ${escapeMarkdown(itemName)}\n` +
		`💵 مبلغ سفارش: ${formatUsd(order.usdPriceSnapshot)}\n` +
		`📊 وضعیت: ${statusLabel}\n` +
		`📅 تاریخ ثبت: ${formatPersianDateTime(order.createdAt)}`;

	if (order.status === "PROCESSING") {
		messageText += `\n\nℹ️ سفارش شما در حال حاضر در حال پردازش توسط ادمین است و امکان لغو آن وجود ندارد.`;
	} else if (order.status === "REJECTED") {
		const categoryInfo =
			order.rejectionCategory && order.rejectionCategory in ORDER_REJECTION_CATEGORIES
				? ORDER_REJECTION_CATEGORIES[order.rejectionCategory as OrderRejectionCategoryCode]
				: null;

		let reasonText = "";
		if (categoryInfo) {
			if (categoryInfo.code === "OTHER") {
				reasonText = order.rejectionNote ? escapeMarkdown(order.rejectionNote) : categoryInfo.label;
			} else {
				reasonText = categoryInfo.label;
				if (order.rejectionNote) {
					reasonText += `\n💬 توضیحات: ${escapeMarkdown(order.rejectionNote)}`;
				}
			}
		} else if (order.rejectionCategory) {
			reasonText = escapeMarkdown(order.rejectionCategory);
			if (order.rejectionNote) {
				reasonText += `\n💬 توضیحات: ${escapeMarkdown(order.rejectionNote)}`;
			}
		} else if (order.rejectionNote) {
			reasonText = escapeMarkdown(order.rejectionNote);
		}

		if (reasonText) {
			messageText += `\n\nعلت رد سفارش: ${reasonText}`;
		}
	} else if (order.status === "FULFILLED" && order.deliveryContent) {
		messageText += `\n\n📦 مشخصات تحویل:\n${escapeMarkdown(order.deliveryContent)}`;
	}

	const keyboard = new InlineKeyboard();
	let hasCancelButton = false;

	if (order.status === "PLACED") {
		keyboard.text("❌ لغو سفارش", `order:cancel:${order.id}`).row();
		hasCancelButton = true;
	}

	keyboard.text("🔙 بازگشت به لیست", ACCOUNT_CALLBACKS.ORDERS);

	return {
		messageText,
		keyboard,
		hasCancelButton,
	};
}

export interface TransactionHistoryViewResult {
	messageText: string;
	keyboard: InlineKeyboard;
	isEmpty: boolean;
}

export interface ParsedTransactionNarrative {
	title: string;
	referenceLabel?: string;
	referenceCode?: string;
}

/**
 * Parses and translates English ledger narratives into clean Persian titles and reference codes.
 */
export function parseTransactionNarrative(
	narrative: string | null | undefined,
): ParsedTransactionNarrative {
	if (!narrative || !narrative.trim()) {
		return { title: "تراکنش" };
	}

	const trimmed = narrative.trim();

	const cancelMatch = trimmed.match(/^Order cancellation refund for order\s+([a-zA-Z0-9_-]+)$/i);
	if (cancelMatch) {
		const rawId = cancelMatch[1]!.replace(/^#/, "");
		const shortId = rawId.length > 8 ? rawId.slice(0, 8) : rawId;
		return {
			title: "استرداد وجه لغو سفارش",
			referenceLabel: "کد سفارش",
			referenceCode: shortId,
		};
	}

	const rejectMatch = trimmed.match(/^Order rejection refund for order\s+([a-zA-Z0-9_-]+)$/i);
	if (rejectMatch) {
		const rawId = rejectMatch[1]!.replace(/^#/, "");
		const shortId = rawId.length > 8 ? rawId.slice(0, 8) : rawId;
		return {
			title: "استرداد وجه رد سفارش",
			referenceLabel: "کد سفارش",
			referenceCode: shortId,
		};
	}

	const refundMatch = trimmed.match(/^Order refund for order\s+([a-zA-Z0-9_-]+)$/i);
	if (refundMatch) {
		const rawId = refundMatch[1]!.replace(/^#/, "");
		const shortId = rawId.length > 8 ? rawId.slice(0, 8) : rawId;
		return {
			title: "بازگشت وجه سفارش",
			referenceLabel: "کد سفارش",
			referenceCode: shortId,
		};
	}

	const spendMatch = trimmed.match(/^Order placement spend for order\s+([a-zA-Z0-9_-]+)$/i);
	if (spendMatch) {
		const rawId = spendMatch[1]!.replace(/^#/, "");
		const shortId = rawId.length > 8 ? rawId.slice(0, 8) : rawId;
		return {
			title: "پرداخت هزینه سفارش",
			referenceLabel: "کد سفارش",
			referenceCode: shortId,
		};
	}

	const topUpMatch = trimmed.match(/^Top-up approval for request\s+([a-zA-Z0-9_-]+)$/i);
	if (topUpMatch) {
		const rawId = topUpMatch[1]!.replace(/^#/, "");
		const shortId = rawId.length > 8 ? rawId.slice(0, 8) : rawId;
		return {
			title: "شارژ کیف پول",
			referenceLabel: "کد پیگیری",
			referenceCode: shortId,
		};
	}

	if (/^Original spend$/i.test(trimmed)) {
		return { title: "پرداخت هزینه سفارش" };
	}

	if (/^Top-up approval$/i.test(trimmed)) {
		return { title: "شارژ کیف پول" };
	}

	return {
		title: trimmed,
	};
}

/**
 * Builds the text and inline keyboard for the 5-transaction history list view.
 */
export function buildTransactionHistoryView(
	entries: RecentWalletTransactionEntry[],
): TransactionHistoryViewResult {
	const keyboard = new InlineKeyboard();
	keyboard.text("🔙 بازگشت به پروفایل", ACCOUNT_CALLBACKS.PROFILE);

	if (!entries || entries.length === 0) {
		const messageText =
			`💳 *تاریخچه تراکنش‌ها*\n\n` +
			`شما تاکنون هیچ تراکنشی نداشته‌اید.`;

		return {
			messageText,
			keyboard,
			isEmpty: true,
		};
	}

	const displayEntries = entries.slice(0, 5);
	const cards = displayEntries.map((item) => {
		const isCredit = item.entry.direction === "CREDIT";
		const indicator = isCredit ? "➕" : "➖";
		const sign = isCredit ? "+" : "-";
		const formattedAmount = `${sign}${formatUsd(item.entry.usdAmount)}`;
		const date = formatPersianDate(item.entry.createdAt);
		const { title, referenceLabel, referenceCode } = parseTransactionNarrative(item.narrative);

		const escapedTitle = escapeMarkdown(title);
		const formattedTitle = title.includes("*") ? escapedTitle : `*${escapedTitle}*`;

		let card =
			`${indicator} ${formattedTitle}\n` +
			`▫️ مبلغ: \`${formattedAmount}\`\n` +
			`▫️ تاریخ: ${date}`;

		if (referenceCode) {
			const label = referenceLabel || "کد پیگیری";
			card += `\n▫️ ${label}: \`#${referenceCode}\``;
		}

		return card;
	});

	const messageText =
		`💳 *تاریخچه تراکنش‌های شما:*\n` +
		`━━━━━━━━━━━━━━━━━━━━\n\n` +
		cards.join("\n\n────────────────────\n\n");

	return {
		messageText,
		keyboard,
		isEmpty: false,
	};
}
