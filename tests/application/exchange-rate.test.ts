import { describe, it, expect } from 'vitest';
import { setupTestDatabase } from '../helpers/test-db';
import { exchangeRates } from '../../src/db/schema/exchange-rates';
import { setRate, getCurrentRate } from '../../src/application/exchange-rate/exchange-rate.service';
import { count, eq } from 'drizzle-orm';

describe('Exchange Rate Service - setRate', () => {
  const { db } = setupTestDatabase();

  it('appends a new exchange rate row and returns it', async () => {
    const adminTelegramId = 123456789n;
    const irrPerUsd = 620000n;

    const result = await setRate(adminTelegramId, irrPerUsd, db);

    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(typeof result.id).toBe('string');
    expect(result.irrPerUsd).toBe(620000n);
    expect(result.createdByAdminTelegramId).toBe(123456789n);
    expect(result.createdAt).toBeInstanceOf(Date);

    // Verify row exists in the database
    const dbRows = await db
      .select()
      .from(exchangeRates)
      .where(eq(exchangeRates.id, result.id));

    expect(dbRows).toHaveLength(1);
    expect(dbRows[0]?.irrPerUsd).toBe(620000n);
    expect(dbRows[0]?.createdByAdminTelegramId).toBe(123456789n);
  });

  it('accepts number inputs and normalizes them to bigint', async () => {
    const result = await setRate(987654321, 650000, db);

    expect(result.createdByAdminTelegramId).toBe(987654321n);
    expect(result.irrPerUsd).toBe(650000n);
  });

  it('never modifies existing rows when appending subsequent rates', async () => {
    const admin1 = 111111111n;
    const admin2 = 222222222n;

    const firstRate = await setRate(admin1, 600000n, db);
    const secondRate = await setRate(admin2, 630000n, db);

    expect(firstRate.id).not.toBe(secondRate.id);

    // Both rows must persist untouched in the database
    const allRows = await db
      .select()
      .from(exchangeRates)
      .orderBy(exchangeRates.createdAt);

    expect(allRows).toHaveLength(2);

    const [savedFirst, savedSecond] = allRows;
    expect(savedFirst?.id).toBe(firstRate.id);
    expect(savedFirst?.irrPerUsd).toBe(600000n);
    expect(savedFirst?.createdByAdminTelegramId).toBe(111111111n);

    expect(savedSecond?.id).toBe(secondRate.id);
    expect(savedSecond?.irrPerUsd).toBe(630000n);
    expect(savedSecond?.createdByAdminTelegramId).toBe(222222222n);
  });

  it('throws an error if irrPerUsd is zero or negative', async () => {
    await expect(setRate(123456789n, 0n, db)).rejects.toThrow(
      /Exchange rate \(irrPerUsd\) must be a positive integer/i
    );

    await expect(setRate(123456789n, -50000n, db)).rejects.toThrow(
      /Exchange rate \(irrPerUsd\) must be a positive integer/i
    );

    const [countResult] = await db.select({ value: count() }).from(exchangeRates);
    expect(Number(countResult?.value ?? 0)).toBe(0);
  });
});

describe('Exchange Rate Service - getCurrentRate', () => {
  const { db } = setupTestDatabase();

  it('returns null when no exchange rate exists', async () => {
    const rate = await getCurrentRate(db);
    expect(rate).toBeNull();
  });

  it('returns the exchange rate when one exists', async () => {
    const adminId = 123456789n;
    const inserted = await setRate(adminId, 620000n, db);

    const currentRate = await getCurrentRate(db);
    expect(currentRate).not.toBeNull();
    expect(currentRate?.id).toBe(inserted.id);
    expect(currentRate?.irrPerUsd).toBe(620000n);
    expect(currentRate?.createdByAdminTelegramId).toBe(123456789n);
  });

  it('returns the most recently created exchange rate when multiple rates exist', async () => {
    const admin1 = 111111111n;
    const admin2 = 222222222n;

    await setRate(admin1, 600000n, db);
    // Small delay or subsequent insertion to ensure strictly ordered timestamp / sequential row
    const second = await setRate(admin2, 650000n, db);

    const currentRate = await getCurrentRate(db);
    expect(currentRate).not.toBeNull();
    expect(currentRate?.id).toBe(second.id);
    expect(currentRate?.irrPerUsd).toBe(650000n);
    expect(currentRate?.createdByAdminTelegramId).toBe(222222222n);
  });
});

