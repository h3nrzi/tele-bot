import { injectable, inject } from 'tsyringe';
import type { DbClient } from '@/core/database/client';
import { getDefaultDb } from '@/core/database/client';
import type { DbExecutor } from '@/core/database/types';
import type { IExchangeRateRepository } from '@/modules/exchange-rate/exchange-rate.repository.interface';
import { normalizeChatId } from '@/core/shared/telegram.utils';
import { ExchangeRate } from '@/modules/exchange-rate/exchange-rate.entity';
import { InvalidExchangeRateError } from '@/modules/exchange-rate/exchange-rate.errors';
import type { SetRateInput } from '@/modules/exchange-rate/dtos/set-rate.dto';
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
    input: SetRateInput,
    executor?: DbExecutor
  ): Promise<ExchangeRate>;
  public async setRate(
    adminTelegramId: bigint | number,
    irrPerUsd: bigint | number | string,
    executor?: DbExecutor
  ): Promise<ExchangeRate>;
  public async setRate(
    adminTelegramIdOrInput: bigint | number | SetRateInput,
    irrPerUsdOrExecutor?: bigint | number | string | DbExecutor,
    maybeExecutor?: DbExecutor
  ): Promise<ExchangeRate> {
    let adminTelegramId: bigint | number;
    let irrPerUsd: bigint | number | string;
    let executor: DbExecutor | undefined;

    if (typeof adminTelegramIdOrInput === 'object' && adminTelegramIdOrInput !== null) {
      adminTelegramId = adminTelegramIdOrInput.adminTelegramId;
      irrPerUsd = adminTelegramIdOrInput.irrPerUsd;
      executor = irrPerUsdOrExecutor as DbExecutor | undefined;
    } else {
      adminTelegramId = adminTelegramIdOrInput;
      irrPerUsd = irrPerUsdOrExecutor as bigint | number | string;
      executor = maybeExecutor;
    }

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

