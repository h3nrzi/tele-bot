import type { LedgerTransaction } from "@/modules/ledger/entities/ledger-transaction.entity";
import type {
	LedgerEntry,
	LedgerAccountType,
	LedgerEntryDirection,
} from "@/modules/ledger/entities/ledger-entry.entity";
import type { UsdAmount } from "@/core/shared/money.vo";

export interface CreateLedgerEntryParams {
	accountType: LedgerAccountType;
	direction: LedgerEntryDirection;
	usdAmount: UsdAmount | string;
	walletId?: string | null;
}

export interface CreateLedgerTransactionParams {
	topUpRequestId?: string | null;
	orderId?: string | null;
	reversedByLedgerTransactionId?: string | null;
	narrative: string;
	entries: CreateLedgerEntryParams[];
}

export interface CreateLedgerTransactionResult {
	transaction: LedgerTransaction;
	entries: LedgerEntry[];
}

export interface RecentWalletTransactionEntry {
	entry: LedgerEntry;
	narrative: string;
}

/**
 * Domain Repository Interface for Ledger.
 */
export interface ILedgerRepository<TExecutor = unknown> {
	createTransactionWithEntries(
		params: CreateLedgerTransactionParams,
		executor: TExecutor,
	): Promise<CreateLedgerTransactionResult>;
	findOriginalByOrderId(orderId: string, executor: TExecutor): Promise<LedgerTransaction | null>;
	updateReversedBy(transactionId: string, reversedByLedgerTransactionId: string, executor: TExecutor): Promise<void>;
	findRecentByWalletId(walletId: string, limit: number, executor: TExecutor): Promise<RecentWalletTransactionEntry[]>;
}
