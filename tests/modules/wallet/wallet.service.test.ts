import { describe, it, expect, beforeEach } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { users } from '@/modules/buyer/buyer.schema';
import { wallets } from '@/modules/wallet/wallet.schema';
import { BuyerService } from '@/modules/buyer/buyer.service';
import { WalletService } from '@/modules/wallet/wallet.service';
import { eq } from 'drizzle-orm';

describe('Wallet Application Service', () => {
  const { db, container } = setupTestDatabase();
  let buyerService: BuyerService;
  let walletService: WalletService;

  beforeEach(() => {
    buyerService = container.resolve(BuyerService);
    walletService = container.resolve(WalletService);
  });

  it('retrieves wallet by userId with correct available balance', async () => {
    const { buyer, wallet } = await buyerService.register({
      telegramChatId: 111222333n,
      telegramUsername: 'wallet_user',
    });

    const result = await walletService.getBuyerWallet({ userId: buyer.id });
    expect(result).toBeDefined();
    expect(result!.wallet.id).toBe(wallet.id);
    expect(result!.wallet.userId).toBe(buyer.id);
    expect(result!.wallet.availableBalance).toBe('0.00');
    expect(result!.buyer.telegramChatId).toBe(111222333n);
  });

  it('retrieves wallet by telegramChatId', async () => {
    const { buyer, wallet } = await buyerService.register({
      telegramChatId: 999111222n,
      telegramUsername: 'chat_id_user',
    });

    const result = await walletService.getBuyerWallet({ telegramChatId: 999111222n });
    expect(result).toBeDefined();
    expect(result!.wallet.id).toBe(wallet.id);
    expect(result!.buyer.id).toBe(buyer.id);
  });

  it('returns updated balance after direct database balance modification', async () => {
    const { buyer, wallet } = await buyerService.register({
      telegramChatId: 555666777n,
      telegramUsername: 'credited_user',
    });

    await db
      .update(wallets)
      .set({ availableBalance: '150.75' })
      .where(eq(wallets.id, wallet.id));

    const result = await walletService.getBuyerWallet({ userId: buyer.id });
    expect(result).toBeDefined();
    expect(result!.wallet.availableBalance).toBe('150.75');
  });

  it('returns null when querying wallet for non-existent user or chat ID', async () => {
    const byUserId = await walletService.getBuyerWallet({
      userId: '00000000-0000-0000-0000-000000000000',
    });
    expect(byUserId).toBeNull();

    const byChatId = await walletService.getBuyerWallet({
      telegramChatId: 999999999999n,
    });
    expect(byChatId).toBeNull();
  });
});
