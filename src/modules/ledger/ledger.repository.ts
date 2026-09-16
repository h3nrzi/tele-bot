import { injectable } from "tsyringe";
import { eq, and, isNull, asc, desc } from "drizzle-orm";
import { ledgerTransactions, ledgerEntries } from "@/modules/ledger/ledger.schema";
import type { DbExecutor } from "@/core/database/types";
import { LedgerTransaction } from "@/modules/ledger/entities/ledger-transaction.entity";
import { LedgerEntry } from "@/modules/ledger/entities/ledger-entry.entity";
import type {
	ILedgerRepository,
	CreateLedgerTransactionParams,
	CreateLedgerTransactionResult,
	RecentWalletTransactionEntry,
} from "@/modules/ledger/ledger.repository.interface";
import { UsdAmount } from "@/core/shared/money.vo";

@injectable()
export class DrizzleLedgerRepository implements ILedgerRepository<DbExecutor> {
	public async createTransactionWithEntries(
		params: CreateLedgerTransactionParams,
		executor: DbExecutor,
	): Promise<CreateLedgerTransactionResult> {
		// 1. Invariant check on double-entry balance
		LedgerTransaction.validateDoubleEntryBalance(params.entries);

		// 2. Insert transaction
		const [txRow] = await executor
			.insert(ledgerTransactions)
			.values({
				topUpRequestId: params.topUpRequestId ?? null,
				orderId: params.orderId ?? null,
				reversedByLedgerTransactionId: params.reversedByLedgerTransactionId ?? null,
				narrative: params.narrative,
			})
			.returning();

		if (!txRow) {
			throw new Error("Failed to create ledger transaction");
		}

		// 3. Insert entries
		const valuesToInsert = params.entries.map((entry) => ({
			ledgerTransactionId: txRow.id,
			accountType: entry.accountType,
			direction: entry.direction,
			usdAmount: entry.usdAmount instanceof UsdAmount ? entry.usdAmount.toString() : entry.usdAmount,
			walletId: entry.walletId ?? null,
		}));

		const entryRows = await executor.insert(ledgerEntries).values(valuesToInsert).returning();

		if (entryRows.length !== params.entries.length) {
			throw new Error("Failed to insert all ledger entries");
		}

		const domainEntries = entryRows.map(
			(r) =>
				new LedgerEntry({
					id: r.id,
					ledgerTransactionId: r.ledgerTransactionId,
					accountType: r.accountType,
					direction: r.direction,
					usdAmount: r.usdAmount,
					walletId: r.walletId,
					createdAt: r.createdAt,
				}),
		);

		const domainTx = new LedgerTransaction({
			id: txRow.id,
			topUpRequestId: txRow.topUpRequestId,
			orderId: txRow.orderId,
			reversedByLedgerTransactionId: txRow.reversedByLedgerTransactionId,
			narrative: txRow.narrative,
			createdAt: txRow.createdAt,
			entries: domainEntries,
		});

		return {
			transaction: domainTx,
			entries: domainEntries,
		};
	}

	public async findOriginalByOrderId(orderId: string, executor: DbExecutor): Promise<LedgerTransaction | null> {
		const [txRow] = await executor
			.select()
			.from(ledgerTransactions)
			.where(and(eq(ledgerTransactions.orderId, orderId), isNull(ledgerTransactions.reversedByLedgerTransactionId)))
			.orderBy(asc(ledgerTransactions.createdAt))
			.limit(1);

		if (!txRow) {
			return null;
		}

		const entryRows = await executor
			.select()
			.from(ledgerEntries)
			.where(eq(ledgerEntries.ledgerTransactionId, txRow.id));

		const domainEntries = entryRows.map(
			(r) =>
				new LedgerEntry({
					id: r.id,
					ledgerTransactionId: r.ledgerTransactionId,
					accountType: r.accountType,
					direction: r.direction,
					usdAmount: r.usdAmount,
					walletId: r.walletId,
					createdAt: r.createdAt,
				}),
		);

		return new LedgerTransaction({
			id: txRow.id,
			topUpRequestId: txRow.topUpRequestId,
			orderId: txRow.orderId,
			reversedByLedgerTransactionId: txRow.reversedByLedgerTransactionId,
			narrative: txRow.narrative,
			createdAt: txRow.createdAt,
			entries: domainEntries,
		});
	}

	public async updateReversedBy(
		transactionId: string,
		reversedByLedgerTransactionId: string,
		executor: DbExecutor,
	): Promise<void> {
		await executor
			.update(ledgerTransactions)
			.set({
				reversedByLedgerTransactionId,
			})
			.where(eq(ledgerTransactions.id, transactionId));
	}

	public async findRecentByWalletId(
		walletId: string,
		limit: number,
		executor: DbExecutor,
	): Promise<RecentWalletTransactionEntry[]> {
		const rows = await executor
			.select({
				entry: ledgerEntries,
				narrative: ledgerTransactions.narrative,
			})
			.from(ledgerEntries)
			.innerJoin(ledgerTransactions, eq(ledgerEntries.ledgerTransactionId, ledgerTransactions.id))
			.where(
				and(
					eq(ledgerEntries.walletId, walletId),
					eq(ledgerEntries.accountType, "BUYER_WALLET"),
				),
			)
			.orderBy(desc(ledgerEntries.createdAt), desc(ledgerEntries.id))
			.limit(limit);

		return rows.map((r) => ({
			entry: new LedgerEntry({
				id: r.entry.id,
				ledgerTransactionId: r.entry.ledgerTransactionId,
				accountType: r.entry.accountType,
				direction: r.entry.direction,
				usdAmount: r.entry.usdAmount,
				walletId: r.entry.walletId,
				createdAt: r.entry.createdAt,
			}),
			narrative: r.narrative,
		}));
	}
}

export const LedgerRepository = DrizzleLedgerRepository;
