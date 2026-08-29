import type Decimal from 'decimal.js';
import type { TopUpRequest } from '@/modules/top-up/top-up-request.entity';
import type { ExchangeRate } from '@/modules/exchange-rate/exchange-rate.entity';
import type { Wallet } from '@/modules/wallet/wallet.entity';
import type { LedgerTransaction } from '@/modules/ledger/ledger-transaction.entity';
import type { LedgerEntry } from '@/modules/ledger/ledger-entry.entity';

export interface InitiateTopUpInput {
  userId?: string;
  telegramChatId?: bigint | number;
  usdAmount: string | Decimal;
}

export interface InitiateTopUpResult {
  request: TopUpRequest;
  exchangeRate: ExchangeRate;
}

export interface SubmitReceiptInput {
  userId?: string;
  telegramChatId?: bigint | number;
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
  userId?: string;
  telegramChatId?: bigint | number;
}

export interface CancelTopUpOptions {
  now?: Date | undefined;
}

export interface CancelTopUpResult {
  request: TopUpRequest;
}

export type { PendingTopUpRequestItem } from '@/modules/top-up/top-up.repository.interface';
