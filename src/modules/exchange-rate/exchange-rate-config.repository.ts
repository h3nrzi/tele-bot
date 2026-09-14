import { injectable, inject } from 'tsyringe';
import { eq } from 'drizzle-orm';
import { exchangeRateConfig } from '@/modules/exchange-rate/exchange-rate-config.schema';
import { getDefaultDb, type DbClient } from '@/core/database/client';
import type { DbExecutor } from '@/core/database/types';
import { ExchangeRateConfig } from '@/modules/exchange-rate/exchange-rate-config.entity';
import type {
  IExchangeRateConfigRepository,
  UpsertExchangeRateConfigData,
} from './exchange-rate-config.repository.interface';
import { TOKENS } from '@/core/di/tokens';

@injectable()
export class DrizzleExchangeRateConfigRepository
  implements IExchangeRateConfigRepository<DbExecutor>
{
  constructor(
    @inject(TOKENS.DbClient) private readonly defaultDb?: DbClient
  ) {}

  private getDb(executor?: DbExecutor): DbExecutor {
    return executor ?? this.defaultDb ?? getDefaultDb();
  }

  public async find(executor?: DbExecutor): Promise<ExchangeRateConfig | null> {
    const db = this.getDb(executor);
    const [row] = await db
      .select()
      .from(exchangeRateConfig)
      .limit(1);

    if (!row) {
      return null;
    }

    return new ExchangeRateConfig({
      id: row.id,
      mode: row.mode,
      spreadPercent: row.spreadPercent,
      syncIntervalMinutes: row.syncIntervalMinutes,
      updatedByAdminTelegramId: row.updatedByAdminTelegramId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  public async upsert(
    data: UpsertExchangeRateConfigData,
    executor?: DbExecutor
  ): Promise<ExchangeRateConfig> {
    const db = this.getDb(executor);
    const existing = await this.find(db);

    if (existing) {
      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };
      if (data.mode !== undefined) updateData.mode = data.mode;
      if (data.spreadPercent !== undefined) updateData.spreadPercent = data.spreadPercent;
      if (data.syncIntervalMinutes !== undefined) updateData.syncIntervalMinutes = data.syncIntervalMinutes;
      if (data.updatedByAdminTelegramId !== undefined) updateData.updatedByAdminTelegramId = data.updatedByAdminTelegramId;

      const [row] = await db
        .update(exchangeRateConfig)
        .set(updateData)
        .where(eq(exchangeRateConfig.id, existing.id))
        .returning();

      if (!row) {
        throw new Error('Failed to update exchange rate config');
      }

      return new ExchangeRateConfig({
        id: row.id,
        mode: row.mode,
        spreadPercent: row.spreadPercent,
        syncIntervalMinutes: row.syncIntervalMinutes,
        updatedByAdminTelegramId: row.updatedByAdminTelegramId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
    }

    const [row] = await db
      .insert(exchangeRateConfig)
      .values({
        mode: data.mode ?? 'MANUAL',
        spreadPercent: data.spreadPercent ?? '0.00',
        syncIntervalMinutes: data.syncIntervalMinutes ?? 60,
        updatedByAdminTelegramId: data.updatedByAdminTelegramId ?? null,
      })
      .returning();

    if (!row) {
      throw new Error('Failed to insert exchange rate config');
    }

    return new ExchangeRateConfig({
      id: row.id,
      mode: row.mode,
      spreadPercent: row.spreadPercent,
      syncIntervalMinutes: row.syncIntervalMinutes,
      updatedByAdminTelegramId: row.updatedByAdminTelegramId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}

export const ExchangeRateConfigRepository = DrizzleExchangeRateConfigRepository;
