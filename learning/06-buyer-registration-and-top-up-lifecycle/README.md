# 📖 Lesson 06: Top-Up Request Lifecycle, State Machine & Admin Approval Workflow

In this lesson, you will build the central business workflow of the application: the **Top-Up Request State Machine**, receipt handling ([`ADR-0005`](file:///Users/hossein/Projects/tele-bot/docs/adr/0005-telegram-file-id-for-receipt-storage.md)), and the **atomic approval transaction** that couples ledger accounting with wallet crediting and non-blocking buyer push notifications.

---

## 🎯 Learning Objectives
1. Implement the **Top-Up State Machine**:
   $$\text{INITIATED} \longrightarrow \text{PENDING} \longrightarrow \begin{cases} \text{APPROVED} \\ \text{REJECTED} \\ \text{CANCELLED} \\ \text{EXPIRED} \end{cases}$$
2. Enforce limits: Min/Max USD bounds, single active request per buyer.
3. Lock exchange rates and destination account details at the moment of initiation.
4. Implement receipt photo submission using Telegram `file_id` ([`ADR-0005`](file:///Users/hossein/Projects/tele-bot/docs/adr/0005-telegram-file-id-for-receipt-storage.md)).
5. Execute the **Atomic Approval Transaction** combining row locking, double-entry ledger creation, wallet balance updates, and status mutation.
6. Handle non-blocking buyer notifications safely so Telegram network glitches never roll back committed financial transactions.

---

## 💡 State Machine Diagram

```
           +---------------------------------------------+
           |                 /topup                      |
           v                                             |
   +---------------+                                     |
   |   INITIATED   | (Locked rate, active bank account)  |
   +-------+-------+                                     |
           |                                             |
           | Buyer uploads Receipt photo                 | Buyer cancels
           v                                             |
   +---------------+                                     |
   |    PENDING    | (Awaiting Admin Review)             |
   +---+-------+---+                                     |
       |       |                                         |
Admin  |       | Admin                                   |
Approve|       | Reject                                  |
       v       v                                         v
+----------+ +----------+                           +-----------+
| APPROVED | | REJECTED |                           | CANCELLED |
+----------+ +----------+                           +-----------+
(Credit $    (With reason)
 + Ledger)
```

---

## 🛠️ Step-by-Step Implementation

### Step 1: Top-Up Limits Value Object (`src/modules/top-up/top-up.limits.vo.ts`)

```typescript
import { UsdAmount } from '@/core/shared/money.vo';

export class TopUpLimits {
  constructor(
    public readonly minUsd: UsdAmount,
    public readonly maxUsd: UsdAmount,
    public readonly expiryMinutes: number
  ) {}

  public static fromEnv(): TopUpLimits {
    const min = process.env.TOPUP_MIN_USD || '10.00';
    const max = process.env.TOPUP_MAX_USD || '1000.00';
    const expiry = parseInt(process.env.TOPUP_EXPIRY_MINUTES || '30', 10);

    return new TopUpLimits(UsdAmount.from(min), UsdAmount.from(max), expiry);
  }

  public validateAmount(amount: UsdAmount | string | number): {
    valid: boolean;
    amount: UsdAmount;
    message?: string;
  } {
    try {
      const usd = amount instanceof UsdAmount ? amount : UsdAmount.from(amount);
      if (usd.lt(this.minUsd)) {
        return {
          valid: false,
          amount: usd,
          message: `Minimum top-up amount is ${this.minUsd.format()}`,
        };
      }
      if (usd.gt(this.maxUsd)) {
        return {
          valid: false,
          amount: usd,
          message: `Maximum top-up amount is ${this.maxUsd.format()}`,
        };
      }
      return { valid: true, amount: usd };
    } catch {
      return {
        valid: false,
        amount: UsdAmount.zero(),
        message: 'Invalid USD amount format.',
      };
    }
  }

  public calculateExpiryDate(now = new Date()): Date {
    return new Date(now.getTime() + this.expiryMinutes * 60 * 1000);
  }
}
```

---

### Step 2: Atomic Approval Workflow (`src/modules/top-up/top-up.service.ts`)

The approval operation must execute within a single PostgreSQL transaction:

```typescript
  public async approveTopUp(
    input: ApproveTopUpInput,
    dependencies?: ApproveTopUpDependencies,
    executor?: DbExecutor
  ): Promise<ApproveTopUpResult> {
    const client = (executor ?? this.db) as DbClient;
    const adminId = normalizeChatId(input.adminTelegramId);
    const now = new Date();

    const executeApproval = async (tx: DbExecutor): Promise<ApproveTopUpResult> => {
      // 1. SELECT top_up_request FOR UPDATE
      const request = await this.topUpRepo.findByIdForUpdate(input.topUpRequestId, tx);
      if (!request) {
        throw new TopUpRequestNotFoundError(`Top-up request ${input.topUpRequestId} not found.`);
      }

      if (request.status !== 'PENDING') {
        throw new ConflictError(
          `Cannot approve top-up request with status ${request.status}. Expected PENDING.`
        );
      }

      // 2. Fetch Buyer
      const buyer = await this.buyerRepo.findById(request.userId, tx);
      if (!buyer) {
        throw new Error(`Buyer not found for ID ${request.userId}`);
      }

      // 3. SELECT wallet FOR UPDATE
      const wallet = await this.walletRepo.findByUserIdForUpdate(request.userId, tx);
      if (!wallet) {
        throw new WalletNotFoundError(`Wallet not found for user ID ${request.userId}`);
      }

      // 4. Record Double-Entry Ledger Entry (SYSTEM_CASH -> BUYER_WALLET)
      const { transaction: ledgerTx, entries } = await this.ledgerService.recordTopUpCredit(
        {
          topUpRequestId: request.id,
          walletId: wallet.id,
          usdAmount: request.usdAmount,
        },
        tx
      );

      // 5. Materialize new Wallet balance
      const newBalance = wallet.credit(request.usdAmount);
      const updatedWallet = await this.walletRepo.updateBalance(wallet.id, newBalance, tx);

      // 6. Update Top-Up Request Status to APPROVED
      const updatedRequest = await this.topUpRepo.updateStatus(
        request.id,
        {
          status: 'APPROVED',
          processedByAdminTelegramId: adminId,
          processedAt: now,
        },
        tx
      );

      return {
        request: updatedRequest!,
        wallet: updatedWallet,
        ledgerTransaction: ledgerTx,
        ledgerEntries: entries as [typeof entries[0], typeof entries[1]],
        buyerChatId: buyer.telegramChatId,
      };
    };

    // Run transaction
    const txResult = await client.transaction(async (tx) => executeApproval(tx));

    // 7. Non-blocking Post-Commit Notification
    if (dependencies?.notifyBuyer) {
      try {
        await dependencies.notifyBuyer({
          buyerTelegramChatId: txResult.buyerChatId,
          creditedUsdAmount: txResult.request.usdAmount.toString(),
          newAvailableBalance: txResult.wallet.availableBalance,
        });
      } catch (notifyErr) {
        console.error(
          `Failed to send buyer push notification to ${txResult.buyerChatId}:`,
          notifyErr
        );
      }
    }

    return txResult;
  }
```

---

### Step 3: Receipt Submission Flow

```typescript
  public async submitReceipt(
    input: SubmitReceiptInput,
    options?: SubmitReceiptOptions,
    executor?: DbExecutor
  ): Promise<SubmitReceiptResult> {
    const client = executor ?? this.db;
    const now = options?.now ?? new Date();
    const userId = await this.resolveUserId(input, client);

    const activeRequest = await this.topUpRepo.findActiveByUserId(userId, client);
    if (!activeRequest) {
      throw new NoInitiatedTopUpRequestError('No active initiated top-up request found to attach receipt.');
    }

    if (activeRequest.isExpired(now)) {
      await this.topUpRepo.updateStatus(activeRequest.id, { status: 'EXPIRED' }, client);
      throw new TopUpRequestExpiredError('This top-up request has expired. Please initiate a new top-up.');
    }

    const updated = await this.topUpRepo.updateReceipt(
      activeRequest.id,
      {
        receiptFileId: input.receiptFileId,
        receiptCaption: input.receiptCaption ?? null,
        status: 'PENDING',
      },
      client
    );

    return { request: updated! };
  }
```

---

## 🧪 Verification & Testing

Run all 8 test suites covering the top-up module:
```bash
npx vitest run tests/modules/top-up/
```

Expected output:
```
✓ tests/modules/top-up/top-up-approval.test.ts (6 tests)
✓ tests/modules/top-up/top-up-rejection.test.ts (7 tests)
✓ tests/modules/top-up/top-up-initiation.test.ts (8 tests)
✓ tests/modules/top-up/top-up-pending.test.ts (4 tests)
✓ tests/modules/top-up/top-up-cancellation.test.ts (4 tests)
✓ tests/modules/top-up/receipt-submission.test.ts (5 tests)
✓ tests/modules/top-up/top-up-status.test.ts (3 tests)
✓ tests/modules/top-up/top-up-request.entity.test.ts (7 tests)
```

---

## 🚀 Next Step
Proceed to [**Lesson 07: Telegram Bot Setup, Admin Middleware & Keyboards**](file:///Users/hossein/Projects/tele-bot/learning/07-grammy-bot-middleware-and-keyboards/README.md).
