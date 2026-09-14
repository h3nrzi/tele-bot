import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Context } from 'grammy';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { createMockContext } from '@tests/helpers/mock-context';
import {
  handleRateModeCommand,
  handleRateModeSwitchCallback,
  handleRateModeCancelCallback,
} from '@/bot/handlers/admin/rate-mode.handler';
import { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import { ExchangeRateConfigService } from '@/modules/exchange-rate/exchange-rate-config.service';
import { exchangeRates } from '@/modules/exchange-rate/exchange-rate.schema';
import type { WallexClient } from '@/modules/wallex/wallex.client.interface';
import { WallexNetworkError } from '@/modules/wallex/wallex.errors';
import { count } from 'drizzle-orm';

function createMockRateModeContext(
  from?: { id: number; username?: string },
  options?: { match?: string; callbackQueryData?: string }
) {
  const repliedMessages: string[] = [];
  const editedMessages: string[] = [];
  const answeredCallbackQueries: string[] = [];

  const fromUser = from
    ? {
        id: from.id,
        is_bot: false,
        first_name: 'Admin',
        username: from.username,
      }
    : undefined;

  const ctx = {
    from: fromUser,
    match: options?.match,
    callbackQuery: options?.callbackQueryData
      ? {
          id: 'cb_query_1',
          data: options.callbackQueryData,
          from: fromUser,
          message: {
            message_id: 1,
            date: Math.floor(Date.now() / 1000),
            chat: { id: from?.id ?? 1, type: 'private' },
            text: '🔄 تنظیم حالت نرخ ارز',
          },
        }
      : undefined,
    reply: vi.fn(async (text: string) => {
      repliedMessages.push(text);
    }),
    editMessageText: vi.fn(async (text: string) => {
      editedMessages.push(text);
    }),
    answerCallbackQuery: vi.fn(async (args?: any) => {
      if (typeof args === 'string') answeredCallbackQueries.push(args);
      else if (args?.text) answeredCallbackQueries.push(args.text);
    }),
  } as unknown as Context;

  return { ctx, repliedMessages, editedMessages, answeredCallbackQueries };
}

describe('Rate Mode Toggle Handler', () => {
  const { db, container } = setupTestDatabase();
  const exchangeRateService = container.resolve(ExchangeRateService);
  const exchangeRateConfigService = container.resolve(ExchangeRateConfigService);
  const adminChatId = 123456789;

  let mockWallexClient: WallexClient;

  beforeEach(() => {
    mockWallexClient = {
      getOtcPrice: vi.fn(),
      placeOtcOrder: vi.fn(),
    };
  });

  describe('handleRateModeCommand', () => {
    it('displays prompt to switch to AUTO_SYNC when current mode is MANUAL', async () => {
      await exchangeRateConfigService.updateMode('MANUAL', adminChatId);

      const { ctx, repliedMessages } = createMockRateModeContext({
        id: adminChatId,
        username: 'admin_user',
      });

      await handleRateModeCommand(ctx, {
        exchangeRateConfigService,
        exchangeRateService,
        wallexClient: mockWallexClient,
      });

      expect(ctx.reply).toHaveBeenCalledTimes(1);
      expect(repliedMessages[0]).toContain('حالت فعلی: *دستی');
      expect(repliedMessages[0]).toContain('خودکار');

      const replyCall = (ctx.reply as any).mock.calls[0];
      const keyboard = replyCall[1]?.reply_markup;
      expect(keyboard).toBeDefined();
    });

    it('displays prompt to switch to MANUAL when current mode is AUTO_SYNC', async () => {
      await exchangeRateConfigService.updateMode('AUTO_SYNC', adminChatId);

      const { ctx, repliedMessages } = createMockRateModeContext({
        id: adminChatId,
        username: 'admin_user',
      });

      await handleRateModeCommand(ctx, {
        exchangeRateConfigService,
        exchangeRateService,
        wallexClient: mockWallexClient,
      });

      expect(ctx.reply).toHaveBeenCalledTimes(1);
      expect(repliedMessages[0]).toContain('حالت فعلی: *خودکار');
      expect(repliedMessages[0]).toContain('دستی');
    });
  });

  describe('handleRateModeSwitchCallback (MANUAL -> AUTO_SYNC)', () => {
    it('fetches Wallex OTC quote, inserts first baseline rate, updates mode, and confirms', async () => {
      await exchangeRateConfigService.updateMode('MANUAL', adminChatId);

      (mockWallexClient.getOtcPrice as any).mockResolvedValue({
        symbol: 'USDTTMN',
        side: 'BUY',
        priceIrr: 910000n,
      });

      const { ctx, editedMessages } = createMockRateModeContext(
        { id: adminChatId, username: 'admin_user' },
        { match: 'AUTO_SYNC', callbackQueryData: 'ratemode:switch:AUTO_SYNC' }
      );

      await handleRateModeSwitchCallback(ctx, {
        exchangeRateConfigService,
        exchangeRateService,
        wallexClient: mockWallexClient,
      });

      expect(mockWallexClient.getOtcPrice).toHaveBeenCalledWith('USDTTMN', 'BUY');

      // Mode updated to AUTO_SYNC
      const config = await exchangeRateConfigService.getConfig();
      expect(config.mode).toBe('AUTO_SYNC');

      // Baseline rate inserted into exchange_rates
      const currentRate = await exchangeRateService.getCurrentRate();
      expect(currentRate).toBeDefined();
      expect(currentRate?.irrPerUsd).toBe(910000n);

      // Confirmation message sent
      expect(editedMessages[0]).toContain('با موفقیت به خودکار');
      expect(editedMessages[0]).toContain('910,000');
    });

    it('aborts switch when Wallex is unreachable, preserves MANUAL mode, and notifies admin', async () => {
      await exchangeRateConfigService.updateMode('MANUAL', adminChatId);

      (mockWallexClient.getOtcPrice as any).mockRejectedValue(
        new WallexNetworkError('Failed to connect to Wallex API')
      );

      const { ctx, editedMessages } = createMockRateModeContext(
        { id: adminChatId, username: 'admin_user' },
        { match: 'AUTO_SYNC', callbackQueryData: 'ratemode:switch:AUTO_SYNC' }
      );

      await handleRateModeSwitchCallback(ctx, {
        exchangeRateConfigService,
        exchangeRateService,
        wallexClient: mockWallexClient,
      });

      expect(mockWallexClient.getOtcPrice).toHaveBeenCalledWith('USDTTMN', 'BUY');

      // Mode remains MANUAL
      const config = await exchangeRateConfigService.getConfig();
      expect(config.mode).toBe('MANUAL');

      // No exchange rate row inserted
      const [countResult] = await db.select({ value: count() }).from(exchangeRates);
      expect(Number(countResult?.value ?? 0)).toBe(0);

      // Error message sent
      expect(editedMessages[0]).toContain('خطا در اتصال به صرافی والکس');
      expect(editedMessages[0]).toContain('لغو شد');
    });
  });

  describe('handleRateModeSwitchCallback (AUTO_SYNC -> MANUAL)', () => {
    it('updates mode to MANUAL and preserves last synced rate in exchange_rates', async () => {
      // Set initial rate and set mode to AUTO_SYNC
      await exchangeRateService.setRate({
        adminTelegramId: BigInt(adminChatId),
        irrPerUsd: 890000n,
      });
      await exchangeRateConfigService.updateMode('AUTO_SYNC', adminChatId);

      const { ctx, editedMessages } = createMockRateModeContext(
        { id: adminChatId, username: 'admin_user' },
        { match: 'MANUAL', callbackQueryData: 'ratemode:switch:MANUAL' }
      );

      await handleRateModeSwitchCallback(ctx, {
        exchangeRateConfigService,
        exchangeRateService,
        wallexClient: mockWallexClient,
      });

      // Wallex should not be contacted when switching to MANUAL
      expect(mockWallexClient.getOtcPrice).not.toHaveBeenCalled();

      // Mode updated to MANUAL
      const config = await exchangeRateConfigService.getConfig();
      expect(config.mode).toBe('MANUAL');

      // Previous rate is preserved
      const currentRate = await exchangeRateService.getCurrentRate();
      expect(currentRate?.irrPerUsd).toBe(890000n);

      expect(editedMessages[0]).toContain('با موفقیت به دستی');
    });
  });

  describe('handleRateModeCancelCallback', () => {
    it('cancels the mode toggle operation cleanly', async () => {
      const { ctx, editedMessages } = createMockRateModeContext(
        { id: adminChatId, username: 'admin_user' },
        { callbackQueryData: 'ratemode:cancel' }
      );

      await handleRateModeCancelCallback(ctx);

      expect(editedMessages[0]).toContain('لغو شد');
    });
  });
});
