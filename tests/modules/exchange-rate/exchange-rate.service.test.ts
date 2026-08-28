import { describe, it, expect } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { exchangeRates } from '@/modules/exchange-rate/exchange-rate.schema';
import {
  setRate,
  getCurrentRate,
  ExchangeRateService,
} from '@/modules/exchange-rate/exchange-rate.service';
import { ExchangeRateRepository } from '@/modules/exchange-rate/exchange-rate.repository';
import { InvalidExchangeRateError } from '@/modules/exchange-rate/exchange-rate.errors';
import { count } from 'drizzle-orm';

describe('Exchange Rate Application Service', () => {
  const { db } = setupTestDatabase();

  it('inserts an append-only exchange rate record and returns active entity', async () => {
    const rate = await setRate(
      {
        adminTelegramId: 123456789n,
        irrPerUsd: 600000n,
      },
      db
    );

    expect(rate).toBeDefined();
    expect(rate.id).toBeDefined();
    expect(rate.irrPerUsd).toBe(600000n);
    expect(rate.createdByAdminTelegramId).toBe(123456789n);
    expect(rate.createdAt).toBeInstanceOf(Date);

    // Verify DB count
    const [countResult] = await db.select({ value: count() }).from(exchangeRates);
    expect(countResult?.value).toBe(1);
  });

  it('returns null when no exchange rate has been configured', async () => {
    const rate = await getCurrentRate(db);
    expect(rate).toBeNull();
  });

  it('returns the latest exchange rate by created_at DESC as active rate', async () => {
    // Insert rate 1
    await setRate({ adminTelegramId: 123456789n, irrPerUsd: 580000n }, db);

    // Wait a brief tick to ensure distinct timestamps
    await new Promise((r) => setTimeout(r, 20));

    // Insert rate 2
    const rate2 = await setRate({ adminTelegramId: 987654321n, irrPerUsd: 610000n }, db);

    const currentRate = await getCurrentRate(db);
    expect(currentRate).toBeDefined();
    expect(currentRate!.id).toBe(rate2.id);
    expect(currentRate!.irrPerUsd).toBe(610000n);
    expect(currentRate!.createdByAdminTelegramId).toBe(987654321n);

    // Verify append-only table contains both rows
    const [countResult] = await db.select({ value: count() }).from(exchangeRates);
    expect(countResult?.value).toBe(2);
  });

  it('throws InvalidExchangeRateError on non-positive or zero rate value', async () => {
    await expect(
      setRate({ adminTelegramId: 123456789n, irrPerUsd: 0n }, db)
    ).rejects.toThrow(InvalidExchangeRateError);

    await expect(
      setRate({ adminTelegramId: 123456789n, irrPerUsd: -5000n }, db)
    ).rejects.toThrow(InvalidExchangeRateError);
  });

  it('handles number and string inputs with conversion to bigint', async () => {
    const rate = await setRate(
      {
        adminTelegramId: 123456789,
        irrPerUsd: '625000',
      },
      db
    );

    expect(rate.irrPerUsd).toBe(625000n);
    expect(rate.createdByAdminTelegramId).toBe(123456789n);
  });

  it('formats rate with Rial separator and Persian currency helpers', async () => {
    const rate = await setRate(
      {
        adminTelegramId: 123456789n,
        irrPerUsd: 650000n,
      },
      db
    );

    expect(rate.formattedRate).toBe('650,000');
  });

  it('supports direct service instance call with (adminTelegramId, irrPerUsd)', async () => {
    const service = new ExchangeRateService(db, new ExchangeRateRepository());
    const rate = await service.setRate(123456789n, 600000n);
    expect(rate.irrPerUsd).toBe(600000n);
  });
});
