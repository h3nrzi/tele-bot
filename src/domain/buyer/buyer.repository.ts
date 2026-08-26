import type { Buyer } from './buyer.entity';

export interface UpsertBuyerResult {
  buyer: Buyer;
  isInserted: boolean;
}

/**
 * Domain Repository Interface for Buyer.
 */
export interface IBuyerRepository<TExecutor = unknown> {
  findById(id: string, executor?: TExecutor): Promise<Buyer | null>;
  findByTelegramChatId(chatId: bigint, executor?: TExecutor): Promise<Buyer | null>;
  upsert(
    data: { telegramChatId: bigint; telegramUsername?: string | null },
    executor?: TExecutor
  ): Promise<UpsertBuyerResult>;
}
