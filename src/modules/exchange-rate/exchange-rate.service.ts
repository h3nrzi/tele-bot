import { injectable, inject } from 'tsyringe';
import type { DbClient } from '@/core/database/client';
import { getDefaultDb } from '@/core/database/client';
import type { DbExecutor } from '@/core/database/types';
import type { IExchangeRateRepository } from '@/modules/exchange-rate/exchange-rate.repository.interface';
import { normalizeChatId } from '@/core/shared/telegram.utils';
import { ExchangeRate } from '@/modules/exchange-rate/exchange-rate.entity';
import { InvalidExchangeRateError } from '@/modules/exchange-rate/exchange-rate.errors';
import { TOKENS } from '@/core/di/tokens';

@injectable()
export class ExchangeRateService {
  constructor(
    @inject(TOKENS.DbClient) private readonly db: DbClient,
    @inject(TOKENS.ExchangeRateRepository)
    private readonly exchangeRateRepo: IExchangeRateRepository<DbExecutor>
  ) {}

  /**
   * Appends a new Exchange Rate row and returns the domain entity.
   * Never modifies or deletes existing rows.
   */
  public async setRate(
    adminTelegramId: bigint | number,
    irrPerUsd: bigint | number,
    executor?: DbExecutor
  ): Promise<ExchangeRate> {
    const client = executor ?? this.db ?? getDefaultDb();
    const adminId = normalizeChatId(adminTelegramId);
    const rate = typeof irrPerUsd === 'bigint' ? irrPerUsd : BigInt(irrPerUsd);

    if (rate <= 0n) {
      throw new InvalidExchangeRateError(
        'Exchange rate (irrPerUsd) must be a positive integer'
      );
    }

    return await this.exchangeRateRepo.insert(
      {
        createdByAdminTelegramId: adminId,
        irrPerUsd: rate,
      },
      client
    );
  }

  /**
   * Returns the most recently created Exchange Rate entity, or null if no rate exists.
   */
  public async getCurrentRate(
    executor?: DbExecutor
  ): Promise<ExchangeRate | null> {
    const client = executor ?? this.db ?? getDefaultDb();
    return await this.exchangeRateRepo.findLatest(client);
  }
}

import { ExchangeRateRepository } from '@/modules/exchange-rate/exchange-rate.repository';

export async function setRate(
  adminTelegramIdOrInput: bigint | number | { adminTelegramId: bigint | number; irrPerUsd: bigint | number | string },
  irrPerUsdOrExecutor?: bigint | number | string | DbExecutor,
  maybeExecutor?: DbExecutor
): Promise<ExchangeRate> {
  const executor = maybeExecutor ?? (typeof irrPerUsdOrExecutor === 'object' && irrPerUsdOrExecutor !== null ? irrPerUsdOrExecutor : undefined) as DbExecutor;
  const service = new ExchangeRateService(
    executor as DbClient,
    new ExchangeRateRepository()
  );
  if (typeof adminTelegramIdOrInput === 'object' && 'adminTelegramId' in adminTelegramIdOrInput) {
    return await service.setRate(
      adminTelegramIdOrInput.adminTelegramId,
      adminTelegramIdOrInput.irrPerUsd as any,
      irrPerUsdOrExecutor as DbExecutor
    );
  }
  return await service.setRate(
    adminTelegramIdOrInput,
    irrPerUsdOrExecutor as any,
    maybeExecutor
  );
}


export async function getCurrentRate(
  executor?: DbExecutor
): Promise<ExchangeRate | null> {
  const service = new ExchangeRateService(
    executor as DbClient,
    new ExchangeRateRepository()
  );
  return await service.getCurrentRate(executor);
}

