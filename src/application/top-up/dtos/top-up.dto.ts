import type Decimal from 'decimal.js';
import type { TopUpRequest } from '@/domain/top-up/top-up-request.entity';
import type { ExchangeRate } from '@/domain/exchange-rate/exchange-rate.entity';
import type { Wallet } from '@/domain/wallet/wallet.entity';
import type { LedgerTransaction } from '@/domain/ledger/ledger-transaction.entity';
import type { LedgerEntry } from '@/domain/ledger/ledger-entry.entity';

export interface InitiateTopUpInput {
  userId: string;
  usdAmount: string | Decimal;
}

export interface InitiateTopUpResult {
  request: TopUpRequest;
  exchangeRate: ExchangeRate;
}

export interface SubmitReceiptInput {
  userId: string;
  fileId: string;
  caption?: string | null | undefined;
}

export interface SubmitReceiptOptions {
  now?: Date | undefined;
}

export interface SubmitReceiptResult {
  request: TopUpRequest;
}

export interface ApproveTopUpInput {
  topUpRequestId: string;
  adminTelegramId: bigint | number;
}

export interface ApproveTopUpDependencies {
  notifyBuyer?: (params: {
    buyerTelegramChatId: bigint;
    creditedUsdAmount: string;
    newAvailableBalance: string;
  }) => Promise<void>;
}

export interface ApproveTopUpResult {
  request: TopUpRequest;
  wallet: Wallet;
  ledgerTransaction: LedgerTransaction;
  ledgerEntries: [LedgerEntry, LedgerEntry];
  buyerChatId: bigint;
}

export interface RejectTopUpInput {
  topUpRequestId: string;
  adminTelegramId: bigint | number;
  rejectionReason: string;
}

export interface RejectTopUpDependencies {
  notifyBuyer?: (params: {
    buyerTelegramChatId: bigint;
    rejectionReason: string;
  }) => Promise<void>;
}

export interface RejectTopUpResult {
  request: TopUpRequest;
  buyerChatId: bigint;
}

export interface CancelTopUpInput {
  userId: string;
}

export interface CancelTopUpOptions {
  now?: Date | undefined;
}

export interface CancelTopUpResult {
  request: TopUpRequest;
}

export type { PendingTopUpRequestItem } from '@/domain/top-up/top-up.repository';



