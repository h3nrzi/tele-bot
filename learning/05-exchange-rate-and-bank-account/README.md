# 📖 Lesson 05: Supporting Modules — Exchange Rates, Bank Accounts & Buyer Registration

In this lesson, you will implement three critical supporting domain modules:
1. **Append-Only Exchange Rate History** ([`ADR-0003`](file:///Users/hossein/Projects/tele-bot/docs/adr/0003-append-only-exchange-rate-history.md)).
2. **Active Bank Account Management** for Card-to-Card payment destinations.
3. **Buyer Registration & Wallet Provisioning** upon `/start`.

---

## 🎯 Learning Objectives
1. Implement an **append-only historical audit log** for USD/IRR exchange rates, ensuring rates attached to pending requests cannot be retroactively altered.
2. Build single active destination management for bank accounts with card number validation.
3. Build atomic **Buyer Onboarding**, ensuring every newly registered buyer automatically receives an associated `Wallet` with `$0.00` available balance.
4. Write comprehensive unit tests for each domain service.

---

## 💡 Concepts & Architecture

### Append-Only Exchange Rates (ADR-0003)
Exchange rates fluctuate constantly. When an Admin updates the rate from 600,000 IRR to 650,000 IRR:
- ❌ **Do NOT** execute `UPDATE exchange_rates SET rate = 650000`. This would corrupt historical records and recalculate in-flight top-up requests!
- ✅ **DO** execute `INSERT INTO exchange_rates ...`. The latest rate is found with `ORDER BY created_at DESC LIMIT 1`. Historical top-ups store a foreign key to the exact exchange rate snapshot in effect when they were initiated.

```
+-------------------------------------------------------------------------------+
|                        exchange_rates (Append-Only)                           |
|-------------------------------------------------------------------------------|
| id     | irr_per_usd | created_by_admin_telegram_id | created_at              |
|--------+-------------+------------------------------+-------------------------|
| rate_1 | 600,000 IRR | 123456789                    | 2026-08-01 10:00:00 UTC |
| rate_2 | 620,000 IRR | 123456789                    | 2026-08-15 14:30:00 UTC |
| rate_3 | 650,000 IRR | 123456789                    | 2026-08-29 09:15:00 UTC | <-- Latest
+-------------------------------------------------------------------------------+
```

---

## 🛠️ Step-by-Step Implementation

### 1. Exchange Rate Service (`src/modules/exchange-rate/exchange-rate.service.ts`)

```typescript
import { injectable, inject } from 'tsyringe';
import { TOKENS } from '@/core/di/tokens';
import type { DbExecutor } from '@/core/database/types';
import type { IExchangeRateRepository } from '@/modules/exchange-rate/exchange-rate.repository.interface';
import { ExchangeRate } from '@/modules/exchange-rate/exchange-rate.entity';
import { InvalidExchangeRateError } from '@/modules/exchange-rate/exchange-rate.errors';
import type { SetRateDto } from '@/modules/exchange-rate/dtos/set-rate.dto';

@injectable()
export class ExchangeRateService {
  constructor(
    @inject(TOKENS.ExchangeRateRepository)
    private readonly repo: IExchangeRateRepository<DbExecutor>
  ) {}

  public async setRate(dto: SetRateDto, executor?: DbExecutor): Promise<ExchangeRate> {
    const rateIrr = typeof dto.rateIrr === 'bigint' ? dto.rateIrr : BigInt(dto.rateIrr);
    if (rateIrr <= 0n) {
      throw new InvalidExchangeRateError('Exchange rate must be a positive integer.');
    }

    return await this.repo.insert(
      {
        irrPerUsd: rateIrr,
        createdByAdminTelegramId: BigInt(dto.adminTelegramId),
      },
      executor
    );
  }

  public async getLatestRate(executor?: DbExecutor): Promise<ExchangeRate | null> {
    return await this.repo.findLatest(executor);
  }
}
```

---

### 2. Bank Account Service (`src/modules/bank-account/bank-account.service.ts`)

```typescript
import { injectable, inject } from 'tsyringe';
import { TOKENS } from '@/core/di/tokens';
import type { DbExecutor } from '@/core/database/types';
import type { IBankAccountRepository } from '@/modules/bank-account/bank-account.repository.interface';
import { BankAccount } from '@/modules/bank-account/bank-account.entity';
import { InvalidBankAccountError } from '@/modules/bank-account/bank-account.errors';
import type { SetActiveAccountDto } from '@/modules/bank-account/dtos/set-active-account.dto';

@injectable()
export class BankAccountService {
  constructor(
    @inject(TOKENS.BankAccountRepository)
    private readonly repo: IBankAccountRepository<DbExecutor>
  ) {}

  public async setActiveAccount(
    dto: SetActiveAccountDto,
    executor?: DbExecutor
  ): Promise<BankAccount> {
    const cleanCardNumber = dto.cardNumber.replace(/\D/g, '');
    if (cleanCardNumber.length !== 16) {
      throw new InvalidBankAccountError('Card number must contain exactly 16 digits.');
    }
    if (!dto.cardHolderName.trim()) {
      throw new InvalidBankAccountError('Card holder name cannot be empty.');
    }
    if (!dto.bankName.trim()) {
      throw new InvalidBankAccountError('Bank name cannot be empty.');
    }

    return await this.repo.createAndActivate(
      {
        cardNumber: cleanCardNumber,
        cardHolderName: dto.cardHolderName.trim(),
        bankName: dto.bankName.trim(),
        additionalNotes: dto.additionalNotes?.trim() ?? null,
      },
      executor
    );
  }

  public async getActiveAccount(executor?: DbExecutor): Promise<BankAccount | null> {
    return await this.repo.getActive(executor);
  }
}
```

---

### 3. Buyer Registration Service (`src/modules/buyer/buyer.service.ts`)

When a Buyer sends `/start`:
1. Find or create the `users` record using `telegramChatId`.
2. Upsert the associated `wallets` record with `availableBalance = '0.00'`.
3. Wrap in a single transaction if needed.

```typescript
import { injectable, inject } from 'tsyringe';
import { TOKENS } from '@/core/di/tokens';
import type { DbClient } from '@/core/database/client';
import type { DbExecutor } from '@/core/database/types';
import type { IBuyerRepository } from '@/modules/buyer/buyer.repository.interface';
import type { IWalletRepository } from '@/modules/wallet/wallet.repository.interface';
import { normalizeChatId } from '@/core/shared/telegram.utils';
import type { RegisterBuyerDto, RegisterBuyerResult } from '@/modules/buyer/dtos/register-buyer.dto';

@injectable()
export class BuyerService {
  constructor(
    @inject(TOKENS.DbClient) private readonly db: DbClient,
    @inject(TOKENS.BuyerRepository) private readonly buyerRepo: IBuyerRepository<DbExecutor>,
    @inject(TOKENS.WalletRepository) private readonly walletRepo: IWalletRepository<DbExecutor>
  ) {}

  public async registerBuyer(
    dto: RegisterBuyerDto,
    executor?: DbExecutor
  ): Promise<RegisterBuyerResult> {
    const client = executor ?? this.db;
    const chatId = normalizeChatId(dto.telegramChatId);

    // 1. Check existing buyer
    let buyer = await this.buyerRepo.findByTelegramChatId(chatId, client);
    let isNew = false;

    if (!buyer) {
      buyer = await this.buyerRepo.insert(
        {
          telegramChatId: chatId,
          telegramUsername: dto.telegramUsername ?? null,
        },
        client
      );
      isNew = true;
    }

    // 2. Ensure wallet exists
    const wallet = await this.walletRepo.upsert(buyer.id, '0.00', client);

    return { buyer, wallet, isNew };
  }
}
```

---

## 🧪 Verification & Testing

Run tests for these three services:
```bash
npx vitest run tests/modules/exchange-rate/ tests/modules/bank-account/ tests/modules/buyer/
```

Expected output:
```
✓ tests/modules/exchange-rate/exchange-rate.service.test.ts (7 tests)
✓ tests/modules/bank-account/bank-account.service.test.ts (10 tests)
✓ tests/modules/buyer/registration.service.test.ts (5 tests)
```

---

## 🚀 Next Step
Proceed to [**Lesson 06: Top-Up Request Lifecycle, State Machine & Admin Approval Workflow**](file:///Users/hossein/Projects/tele-bot/learning/06-buyer-registration-and-top-up-lifecycle/README.md).
