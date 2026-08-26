import { desc } from 'drizzle-orm';
import { exchangeRates } from '../../db/schema/exchange-rates';
import { getDefaultDb } from '../../db/client';
import type { DbExecutor } from '../db/types';
import { ExchangeRate } from '../../domain/exchange-rate/exchange-rate.entity';
import type { IExchangeRateRepository } from '../../domain/exchange-rate/exchange-rate.repository';

export class DrizzleExchangeRateRepository
  implements IExchangeRateRepository<DbExecutor>
{
  private getDb(executor?: DbExecutor): DbExecutor {
    return executor ?? getDefaultDb();
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

export const exchangeRateRepository = new DrizzleExchangeRateRepository();
