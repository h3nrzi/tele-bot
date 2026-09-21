import pg from "pg";
import { createDatabaseConnection, type DbClient } from "@/core/database/client";
import { applyMigrations } from "@/core/database/migrate";
import { cleanDatabase } from "@/core/database/clean";
import * as schema from "@/core/database/schema";

export interface SeedDatabaseOptions {
	pool?: pg.Pool | undefined;
	db?: DbClient | undefined;
	connectionString?: string | undefined;
	cleanFirst?: boolean | undefined;
}

export interface SeedResult {
	bankAccountsCount: number;
	exchangeRatesCount: number;
	catalogItemsCount: number;
	buyersCount: number;
	topUpRequestsCount: number;
	ordersCount: number;
	ledgerTransactionsCount: number;
	durationMs: number;
}

/**
 * Seeds the database with realistic development and testing data.
 * Adheres to domain rules and double-entry accounting invariants.
 */
export async function seedDatabase(options?: SeedDatabaseOptions): Promise<SeedResult> {
	const startTime = Date.now();
	let pool: pg.Pool;
	let db: DbClient;
	let shouldClosePool = false;

	if (options?.db && options?.pool) {
		db = options.db;
		pool = options.pool;
	} else if (options?.pool) {
		pool = options.pool;
		const conn = createDatabaseConnection(options?.connectionString);
		db = conn.db;
	} else if (options?.db) {
		db = options.db;
		const conn = createDatabaseConnection(options?.connectionString);
		pool = conn.pool;
		shouldClosePool = true;
	} else {
		const conn = createDatabaseConnection(options?.connectionString);
		db = conn.db;
		pool = conn.pool;
		shouldClosePool = true;
	}

	try {
		// 1. Ensure migrations are up-to-date
		await applyMigrations(db);

		// 2. Clean if requested
		if (options?.cleanFirst) {
			await cleanDatabase({ pool, drop: false });
		}

		// 3. Admin identifier from environment or fallback
		const envAdminIds = process.env.ADMIN_IDS?.split(",").map((s) => s.trim()).filter(Boolean);
		const defaultAdminId = envAdminIds && envAdminIds.length > 0 ? BigInt(envAdminIds[0]!) : 123456789n;

		// 4. Seed Bank Accounts (1 active, 1 inactive)
		const bankAccountsData = await db
			.insert(schema.bankAccounts)
			.values([
				{
					cardNumber: "6037997123456789",
					cardHolderName: "امیرحسین رضایی",
					bankName: "بانک ملی ایران",
					additionalNotes: "لطفاً پس از واریز، حتماً تصویر رسید را ارسال فرمایید. انتقال به نام واریزکننده باشد.",
					isActive: true,
				},
				{
					cardNumber: "5022291098765432",
					cardHolderName: "شرکت تجارت نوین دیجیتال",
					bankName: "بانک پاسارگاد",
					additionalNotes: "حساب پشتیبان - در حال حاضر غیرفعال",
					isActive: false,
				},
			])
			.returning();

		// 5. Seed Exchange Rate and Exchange Rate Config
		const exchangeRateData = await db
			.insert(schema.exchangeRates)
			.values([
				{
					irrPerUsd: 950000n, // 95,000 Tomans per USD
					createdByAdminTelegramId: defaultAdminId,
				},
			])
			.returning();
		const currentExchangeRate = exchangeRateData[0]!;

		await db.insert(schema.exchangeRateConfig).values({
			mode: "MANUAL",
			spreadPercent: "2.50",
			syncIntervalMinutes: 60,
			updatedByAdminTelegramId: defaultAdminId,
		});

		// 6. Seed Catalog Items (covering all 4 catalog types and fulfillment strategies)
		const catalogItemsData = await db
			.insert(schema.catalogItems)
			.values([
				{
					name: "گیفت کارت ۱۰ دلاری اپل (Apple Gift Card $10)",
					description: "کد شارژ اورجینال ۱۰ دلاری اپل برای اپ استور آمریکا با تحویل آنی",
					usdPrice: "10.00",
					isActive: true,
					catalogType: "STATIC_DELIVERY",
					fulfillmentStrategy: "PAYLOAD_DELIVERY",
					requirementConfig: null,
				},
				{
					name: "تلگرام پرمیوم ۳ ماهه (Telegram Premium 3 Months)",
					description: "فعال‌سازی قانونی تلگرام پرمیوم روی اکانت شخصی شما",
					usdPrice: "14.50",
					isActive: true,
					catalogType: "DIRECT_ACCOUNT",
					fulfillmentStrategy: "ACTIVATION",
					requirementConfig: null,
				},
				{
					name: "تلگرام پرمیوم ۶ ماهه با یوزرنیم (Telegram Premium 6M Handle)",
					description: "شارژ از طریق آیدی یا لینک کاربری تلگرام بدون نیاز به ورود به اکانت",
					usdPrice: "26.00",
					isActive: true,
					catalogType: "IDENTITY_HANDLE",
					fulfillmentStrategy: "ACTIVATION",
					requirementConfig: null,
				},
				{
					name: "اشتراک V2Ray پرسرعت اختصاصی (50GB)",
					description: "کانفیگ پرسرعت V2Ray با ترافیک ۵۰ گیگابایت یک‌ماهه و پینگ پایین مناسب بازی و استریم",
					usdPrice: "4.50",
					isActive: true,
					catalogType: "CONFIG_VPN",
					fulfillmentStrategy: "PAYLOAD_DELIVERY",
					requirementConfig: {
						allowedRegions: [
							"🇩🇪 آلمان (Germany)",
							"🇳🇱 هلند (Netherlands)",
							"🇫🇮 فنلاند (Finland)",
							"🇺🇸 آمریکا (USA)",
						],
					},
				},
				{
					name: "اشتراک چت‌جی‌پی‌تی پلاس (ChatGPT Plus 1 Month)",
					description: "دسترسی به GPT-4o، ساخت تصاویر DALL-E و امکانات نامحدود هوش مصنوعی روی اکانت شخصی",
					usdPrice: "22.00",
					isActive: true,
					catalogType: "DIRECT_ACCOUNT",
					fulfillmentStrategy: "ACTIVATION",
					requirementConfig: null,
				},
				{
					name: "اسپاتیفای فمیلی ۱ ماهه (Spotify Family Invite)",
					description: "دعوتنامه اختصاصی به فمیلی اسپاتیفای (در حال حاضر ناموجود)",
					usdPrice: "2.00",
					isActive: false,
					catalogType: "STATIC_DELIVERY",
					fulfillmentStrategy: "PAYLOAD_DELIVERY",
					requirementConfig: null,
				},
			])
			.returning();

		// 7. Seed Buyers (Users & Wallets)
		// Buyer 1: Funded Buyer
		// Initial top-up: $50.00. Order 1 spend: $10.00. Order 2 spend: $14.50. Available balance: $25.50.
		const buyer1Users = await db
			.insert(schema.users)
			.values({
				telegramChatId: 111222333n,
				telegramUsername: "demo_buyer",
			})
			.returning();
		const buyer1 = buyer1Users[0]!;

		const buyer1Wallets = await db
			.insert(schema.wallets)
			.values({
				userId: buyer1.id,
				availableBalance: "25.50",
			})
			.returning();
		const wallet1 = buyer1Wallets[0]!;

		// Buyer 2: Fresh Buyer with 0 balance
		const buyer2Users = await db
			.insert(schema.users)
			.values({
				telegramChatId: 444555666n,
				telegramUsername: "fresh_buyer",
			})
			.returning();
		const buyer2 = buyer2Users[0]!;

		await db.insert(schema.wallets).values({
			userId: buyer2.id,
			availableBalance: "0.00",
		});

		// 8. Seed Top-Up Requests
		// Top-Up 1 for Buyer 1 (Approved $50.00 top-up)
		const topUp1Data = await db
			.insert(schema.topUpRequests)
			.values({
				userId: buyer1.id,
				exchangeRateId: currentExchangeRate.id,
				lockedIrrPerUsd: 950000n,
				rateSource: "MANUAL",
				usdAmount: "50.00",
				irrAmount: 47500000n,
				status: "APPROVED",
				receiptFileId: "seed_receipt_buyer1_approved",
				receiptCaption: "واریزی ۵۰ دلاری به کارت بانک ملی",
				expiresAt: new Date(Date.now() + 86400000),
				processedByAdminTelegramId: defaultAdminId,
				processedAt: new Date(),
			})
			.returning();
		const topUp1 = topUp1Data[0]!;

		// Completed OTC purchase log for Top-Up 1
		await db.insert(schema.wallexOtcPurchases).values({
			topUpRequestId: topUp1.id,
			usdtQuantity: "50.00",
			status: "COMPLETED",
			wallexClientOrderId: "WALLEX-OTC-SEED-50USD",
			wallexExecutedPrice: 950000n,
			wallexExecutedQty: "50.00000000",
			wallexExecutedSum: 47500000n,
			wallexFee: 0n,
		});

		// Top-Up 2 for Buyer 2 (Pending $20.00 top-up for testing admin review)
		await db.insert(schema.topUpRequests).values({
			userId: buyer2.id,
			exchangeRateId: currentExchangeRate.id,
			lockedIrrPerUsd: 950000n,
			rateSource: "MANUAL",
			usdAmount: "20.00",
			irrAmount: 19000000n,
			status: "PENDING",
			receiptFileId: "seed_receipt_buyer2_pending",
			receiptCaption: "رسید انتقال کارت به کارت ۲۰ دلاری",
			expiresAt: new Date(Date.now() + 3600000),
		});

		// 9. Seed Ledger Transactions & Entries for Top-Up 1 (ADR-0001 double-entry)
		// Debit SYSTEM_CASH, Credit BUYER_WALLET
		const ledgerTx1 = await db
			.insert(schema.ledgerTransactions)
			.values({
				topUpRequestId: topUp1.id,
				narrative: `Top-up approval for request ${topUp1.id}`,
			})
			.returning();

		await db.insert(schema.ledgerEntries).values([
			{
				ledgerTransactionId: ledgerTx1[0]!.id,
				accountType: "SYSTEM_CASH",
				direction: "DEBIT",
				usdAmount: "50.00",
				walletId: null,
			},
			{
				ledgerTransactionId: ledgerTx1[0]!.id,
				accountType: "BUYER_WALLET",
				direction: "CREDIT",
				usdAmount: "50.00",
				walletId: wallet1.id,
			},
		]);

		// 10. Seed Orders for Buyer 1
		// Order 1: Fulfilled Apple Gift Card ($10.00)
		const appleCardItem = catalogItemsData.find((i) => i.usdPrice === "10.00")!;
		const order1Data = await db
			.insert(schema.orders)
			.values({
				userId: buyer1.id,
				catalogItemId: appleCardItem.id,
				usdPriceSnapshot: "10.00",
				status: "FULFILLED",
				fulfillmentStrategySnapshot: "PAYLOAD_DELIVERY",
				deliveryContent: "APPL-GIFT-DEMO-CODE-9876-WXYZ",
				claimedByAdminTelegramId: defaultAdminId,
				claimedAt: new Date(Date.now() - 3600000),
				fulfilledAt: new Date(Date.now() - 1800000),
			})
			.returning();
		const order1 = order1Data[0]!;

		// Ledger transaction for Order 1 spend: Debit BUYER_WALLET $10.00, Credit SYSTEM_CASH $10.00
		const ledgerTx2 = await db
			.insert(schema.ledgerTransactions)
			.values({
				orderId: order1.id,
				narrative: `Order spend for order ${order1.id}`,
			})
			.returning();

		await db.insert(schema.ledgerEntries).values([
			{
				ledgerTransactionId: ledgerTx2[0]!.id,
				accountType: "BUYER_WALLET",
				direction: "DEBIT",
				usdAmount: "10.00",
				walletId: wallet1.id,
			},
			{
				ledgerTransactionId: ledgerTx2[0]!.id,
				accountType: "SYSTEM_CASH",
				direction: "CREDIT",
				usdAmount: "10.00",
				walletId: null,
			},
		]);

		// Order 2: Placed Telegram Premium 3 Months ($14.50)
		const tgPremiumItem = catalogItemsData.find((i) => i.usdPrice === "14.50")!;
		const order2Data = await db
			.insert(schema.orders)
			.values({
				userId: buyer1.id,
				catalogItemId: tgPremiumItem.id,
				usdPriceSnapshot: "14.50",
				status: "PLACED",
				fulfillmentStrategySnapshot: "ACTIVATION",
				buyerInputs: {
					accountIdentifier: "@demo_buyer",
					preferredContact: "telegram",
				},
			})
			.returning();
		const order2 = order2Data[0]!;

		// Order Admin Notification for Order 2
		await db.insert(schema.orderAdminNotifications).values({
			orderId: order2.id,
			adminTelegramId: defaultAdminId,
			chatId: defaultAdminId,
			messageId: 9001n,
		});

		// Ledger transaction for Order 2 spend: Debit BUYER_WALLET $14.50, Credit SYSTEM_CASH $14.50
		const ledgerTx3 = await db
			.insert(schema.ledgerTransactions)
			.values({
				orderId: order2.id,
				narrative: `Order spend for order ${order2.id}`,
			})
			.returning();

		await db.insert(schema.ledgerEntries).values([
			{
				ledgerTransactionId: ledgerTx3[0]!.id,
				accountType: "BUYER_WALLET",
				direction: "DEBIT",
				usdAmount: "14.50",
				walletId: wallet1.id,
			},
			{
				ledgerTransactionId: ledgerTx3[0]!.id,
				accountType: "SYSTEM_CASH",
				direction: "CREDIT",
				usdAmount: "14.50",
				walletId: null,
			},
		]);

		return {
			bankAccountsCount: bankAccountsData.length,
			exchangeRatesCount: exchangeRateData.length,
			catalogItemsCount: catalogItemsData.length,
			buyersCount: 2,
			topUpRequestsCount: 2,
			ordersCount: 2,
			ledgerTransactionsCount: 3,
			durationMs: Date.now() - startTime,
		};
	} finally {
		if (shouldClosePool) {
			await pool.end();
		}
	}
}
