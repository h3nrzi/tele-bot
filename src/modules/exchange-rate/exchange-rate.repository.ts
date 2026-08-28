import { injectable, inject } from 'tsyringe';
import { desc } from 'drizzle-orm';
import { exchangeRates } from '@/modules/exchange-rate/exchange-rate.schema';
import { getDefaultDb, type DbClient } from '@/core/database/client';
import type { DbExecutor } from '@/core/database/types';
import { ExchangeRate } from '@/modules/exchange-rate/exchange-rate.entity';
import type { IExchangeRateRepository } from '@/modules/exchange-rate/exchange-rate.repository.interface';
import { TOKENS } from '@/core/di/tokens';

@injectable()
export class DrizzleExchangeRateRepository
  implements IExchangeRateRepository<DbExecutor>
{
  constructor(
    @inject(TOKENS.DbClient) private readonly defaultDb?: DbClient
  ) {}

  private getDb(executor?: DbExecutor): DbExecutor {
    return executor ?? this.defaultDb ?? getDefaultDb();
  }

  public async findLatest(executor?: DbExecutor): Promise<ExchangeRate | null> {
    const db = this.getDb(executor);
    const [row] = await db
      .select()
      .from(exchangeRates)
      .orderBy(desc(exchangeRates.createdAt))
      .limit(1);

    if (!row) {
      return null;
    }

    return new ExchangeRate({
      id: row.id,
      irrPerUsd: row.irrPerUsd,
      createdByAdminTelegramId: row.createdByAdminTelegramId,
      createdAt: row.createdAt,
    });
  }

  public async insert(
    data: { createdByAdminTelegramId: bigint; irrPerUsd: bigint },
    executor?: DbExecutor
  ): Promise<ExchangeRate> {
    const db = this.getDb(executor);
    const [row] = await db
      .insert(exchangeRates)
      .values({
        createdByAdminTelegramId: data.createdByAdminTelegramId,
        irrPerUsd: data.irrPerUsd,
      })
      .returning();

    if (!row) {
      throw new Error('Failed to insert exchange rate');
    }

    return new ExchangeRate({
      id: row.id,
      irrPerUsd: row.irrPerUsd,
      createdByAdminTelegramId: row.createdByAdminTelegramId,
      createdAt: row.createdAt,
    });
  }
}

export const ExchangeRateRepository = DrizzleExchangeRateRepository;

