import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  syncBaselineRate,
  BaselineRateSyncWorker,
  type SyncBaselineRateDependencies,
} from '@/modules/exchange-rate/baseline-rate-sync.worker';
import { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import { ExchangeRateConfigService } from '@/modules/exchange-rate/exchange-rate-config.service';
import { ExchangeRate } from '@/modules/exchange-rate/exchange-rate.entity';
import type { WallexClient } from '@/modules/wallex/wallex.client.interface';
import { WallexNetworkError, WallexApiError } from '@/modules/wallex/wallex.errors';
import { parseBotIdFromToken } from '@/core/shared/telegram.utils';

describe('parseBotIdFromToken', () => {
  it('extracts numeric bot ID from standard Telegram token', () => {
    expect(parseBotIdFromToken('123456789:ABC-DEF1234ghIkl-zyx57W2v1u123ew11')).toBe(123456789n);
    expect(parseBotIdFromToken('9876543210:AAEEFFGGHHIIJJKKLLMM')).toBe(9876543210n);
  });

  it('handles surrounding whitespace gracefully', () => {
    expect(parseBotIdFromToken('  123456:secret_token  ')).toBe(123456n);
  });

  it('returns null for empty, undefined, or malformed tokens', () => {
    expect(parseBotIdFromToken(undefined)).toBeNull();
    expect(parseBotIdFromToken(null)).toBeNull();
    expect(parseBotIdFromToken('')).toBeNull();
    expect(parseBotIdFromToken('invalid_token_without_colon')).toBeNull();
    expect(parseBotIdFromToken(':empty_bot_id')).toBeNull();
    expect(parseBotIdFromToken('abc:non_numeric_id')).toBeNull();
  });
});

describe('syncBaselineRate (standalone callable)', () => {
  let mockWallexClient: WallexClient;
  let mockExchangeRateService: ExchangeRateService;
  let mockLogger: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const botTelegramId = 987654321n;

  beforeEach(() => {
    mockWallexClient = {
      getOtcPrice: vi.fn(),
      placeOtcOrder: vi.fn(),
    };

    mockExchangeRateService = {
      setRate: vi.fn(),
      getCurrentRate: vi.fn(),
    } as unknown as ExchangeRateService;

    mockLogger = {
      log: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
  });

  it('fetches OTC price and inserts a Baseline Rate with bot Telegram ID', async () => {
    const quote = {
      symbol: 'USDTTMN',
      side: 'BUY' as const,
      priceIrr: 915000n,
    };
    (mockWallexClient.getOtcPrice as any).mockResolvedValue(quote);

    const createdRate = new ExchangeRate({
      id: 'rate-123',
      createdByAdminTelegramId: botTelegramId,
      irrPerUsd: 915000n,
      createdAt: new Date(),
    });
    (mockExchangeRateService.setRate as any).mockResolvedValue(createdRate);

    const result = await syncBaselineRate({
      wallexClient: mockWallexClient,
      exchangeRateService: mockExchangeRateService,
      botTelegramId,
      logger: mockLogger,
    });

    expect(mockWallexClient.getOtcPrice).toHaveBeenCalledWith('USDTTMN', 'BUY');
    expect(mockExchangeRateService.setRate).toHaveBeenCalledWith(botTelegramId, 915000n);
    expect(result).toBe(createdRate);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Baseline rate synced successfully from Wallex: 915000 IRR')
    );
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('gracefully handles WallexNetworkError (logs error, skips insert, no crash)', async () => {
    (mockWallexClient.getOtcPrice as any).mockRejectedValue(
      new WallexNetworkError('Failed to connect to Wallex OTC API')
    );

    const result = await syncBaselineRate({
      wallexClient: mockWallexClient,
      exchangeRateService: mockExchangeRateService,
      botTelegramId,
      logger: mockLogger,
    });

    expect(mockWallexClient.getOtcPrice).toHaveBeenCalledWith('USDTTMN', 'BUY');
    expect(mockExchangeRateService.setRate).not.toHaveBeenCalled();
    expect(result).toBeNull();
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to sync baseline rate from Wallex:',
      expect.any(WallexNetworkError)
    );
  });

  it('gracefully handles WallexApiError (e.g. 500 / 401) without crashing', async () => {
    (mockWallexClient.getOtcPrice as any).mockRejectedValue(
      new WallexApiError('Wallex Internal Server Error', 500)
    );

    const result = await syncBaselineRate({
      wallexClient: mockWallexClient,
      exchangeRateService: mockExchangeRateService,
      botTelegramId,
      logger: mockLogger,
    });

    expect(mockExchangeRateService.setRate).not.toHaveBeenCalled();
    expect(result).toBeNull();
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to sync baseline rate from Wallex:',
      expect.any(WallexApiError)
    );
  });

  it('gracefully handles database errors during setRate without crashing', async () => {
    (mockWallexClient.getOtcPrice as any).mockResolvedValue({
      symbol: 'USDTTMN',
      side: 'BUY',
      priceIrr: 920000n,
    });
    (mockExchangeRateService.setRate as any).mockRejectedValue(
      new Error('Database connection lost')
    );

    const result = await syncBaselineRate({
      wallexClient: mockWallexClient,
      exchangeRateService: mockExchangeRateService,
      botTelegramId,
      logger: mockLogger,
    });

    expect(result).toBeNull();
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to sync baseline rate from Wallex:',
      expect.any(Error)
    );
  });
});



describe('BaselineRateSyncWorker', () => {
  let mockWallexClient: WallexClient;
  let mockExchangeRateService: ExchangeRateService;
  let mockExchangeRateConfigService: ExchangeRateConfigService;
  let mockLogger: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const botTelegramId = 123456789n;

  beforeEach(() => {
    vi.useFakeTimers();

    mockWallexClient = {
      getOtcPrice: vi.fn(),
      placeOtcOrder: vi.fn(),
    };

    mockExchangeRateService = {
      setRate: vi.fn(),
      getCurrentRate: vi.fn(),
    } as unknown as ExchangeRateService;

    mockExchangeRateConfigService = {
      getConfig: vi.fn().mockResolvedValue({
        syncIntervalMinutes: 45,
        mode: 'AUTO_SYNC',
        isAutoSync: () => true,
        isManual: () => false,
      }),
    } as unknown as ExchangeRateConfigService;

    mockLogger = {
      log: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('initializes correctly with options object and tracks running status', () => {
    const worker = new BaselineRateSyncWorker({
      exchangeRateService: mockExchangeRateService,
      exchangeRateConfigService: mockExchangeRateConfigService,
      wallexClient: mockWallexClient,
      botTelegramId,
      logger: mockLogger,
    });

    expect(worker.isRunning()).toBe(false);
    expect(worker.getIntervalMinutes()).toBeNull();
    expect(worker.getBotTelegramId()).toBe(botTelegramId);
  });

  it('updates botTelegramId with setBotTelegramId', () => {
    const origToken = process.env.BOT_TOKEN;
    delete process.env.BOT_TOKEN;

    const worker = new BaselineRateSyncWorker({
      exchangeRateService: mockExchangeRateService,
      exchangeRateConfigService: mockExchangeRateConfigService,
      wallexClient: mockWallexClient,
    });

    expect(worker.getBotTelegramId()).toBeUndefined();
    worker.setBotTelegramId(555666n);
    expect(worker.getBotTelegramId()).toBe(555666n);

    process.env.BOT_TOKEN = origToken;
  });

  it('executes sync() successfully using configured dependencies', async () => {
    const worker = new BaselineRateSyncWorker({
      exchangeRateService: mockExchangeRateService,
      exchangeRateConfigService: mockExchangeRateConfigService,
      wallexClient: mockWallexClient,
      botTelegramId,
      logger: mockLogger,
    });

    (mockWallexClient.getOtcPrice as any).mockResolvedValue({
      symbol: 'USDTTMN',
      side: 'BUY',
      priceIrr: 930000n,
    });
    const expectedRate = new ExchangeRate({
      id: 'rate-789',
      createdByAdminTelegramId: botTelegramId,
      irrPerUsd: 930000n,
      createdAt: new Date(),
    });
    (mockExchangeRateService.setRate as any).mockResolvedValue(expectedRate);

    const result = await worker.sync();

    expect(mockWallexClient.getOtcPrice).toHaveBeenCalledWith('USDTTMN', 'BUY');
    expect(mockExchangeRateService.setRate).toHaveBeenCalledWith(botTelegramId, 930000n);
    expect(result).toBe(expectedRate);
  });

  it('sync() warns and returns null when WallexClient is not configured', async () => {
    const worker = new BaselineRateSyncWorker({
      exchangeRateService: mockExchangeRateService,
      exchangeRateConfigService: mockExchangeRateConfigService,
      wallexClient: undefined,
      botTelegramId,
      logger: mockLogger,
    });

    const result = await worker.sync();

    expect(result).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('WallexClient is not configured')
    );
  });

  it('sync() logs error and returns null when bot Telegram ID is unknown', async () => {
    const origToken = process.env.BOT_TOKEN;
    delete process.env.BOT_TOKEN;

    const worker = new BaselineRateSyncWorker({
      exchangeRateService: mockExchangeRateService,
      exchangeRateConfigService: mockExchangeRateConfigService,
      wallexClient: mockWallexClient,
      logger: mockLogger,
    });

    const result = await worker.sync();

    expect(result).toBeNull();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Bot Telegram ID is unknown')
    );

    process.env.BOT_TOKEN = origToken;
  });

  it('start() sources interval from exchange_rate_config table when not provided', async () => {
    const worker = new BaselineRateSyncWorker({
      exchangeRateService: mockExchangeRateService,
      exchangeRateConfigService: mockExchangeRateConfigService,
      wallexClient: mockWallexClient,
      botTelegramId,
      logger: mockLogger,
    });

    await worker.start();

    expect(mockExchangeRateConfigService.getConfig).toHaveBeenCalled();
    expect(worker.isRunning()).toBe(true);
    expect(worker.getIntervalMinutes()).toBe(45);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('started with interval of 45 minutes')
    );

    worker.stop();
  });

  it('start(customInterval) uses explicitly passed interval', async () => {
    const worker = new BaselineRateSyncWorker({
      exchangeRateService: mockExchangeRateService,
      exchangeRateConfigService: mockExchangeRateConfigService,
      wallexClient: mockWallexClient,
      botTelegramId,
      logger: mockLogger,
    });

    await worker.start(15);

    expect(mockExchangeRateConfigService.getConfig).not.toHaveBeenCalled();
    expect(worker.isRunning()).toBe(true);
    expect(worker.getIntervalMinutes()).toBe(15);

    worker.stop();
  });

  it('start() falls back to default 60 minutes if getConfig() fails', async () => {
    (mockExchangeRateConfigService.getConfig as any).mockRejectedValue(
      new Error('DB unreachable')
    );

    const worker = new BaselineRateSyncWorker({
      exchangeRateService: mockExchangeRateService,
      exchangeRateConfigService: mockExchangeRateConfigService,
      wallexClient: mockWallexClient,
      botTelegramId,
      logger: mockLogger,
    });

    await worker.start();

    expect(worker.isRunning()).toBe(true);
    expect(worker.getIntervalMinutes()).toBe(60);

    worker.stop();
  });

  it('stop() stops active timer and updates running status', async () => {
    const worker = new BaselineRateSyncWorker({
      exchangeRateService: mockExchangeRateService,
      exchangeRateConfigService: mockExchangeRateConfigService,
      wallexClient: mockWallexClient,
      botTelegramId,
      logger: mockLogger,
    });

    await worker.start(30);
    expect(worker.isRunning()).toBe(true);

    worker.stop();
    expect(worker.isRunning()).toBe(false);
    expect(worker.getIntervalMinutes()).toBeNull();
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Baseline rate sync worker stopped')
    );
  });

  it('triggers immediate sync on start when runImmediately is true', async () => {
    const worker = new BaselineRateSyncWorker({
      exchangeRateService: mockExchangeRateService,
      exchangeRateConfigService: mockExchangeRateConfigService,
      wallexClient: mockWallexClient,
      botTelegramId,
      logger: mockLogger,
    });

    (mockWallexClient.getOtcPrice as any).mockResolvedValue({
      symbol: 'USDTTMN',
      side: 'BUY',
      priceIrr: 950000n,
    });

    await worker.start(10, { runImmediately: true });

    expect(mockWallexClient.getOtcPrice).toHaveBeenCalledTimes(1);
    expect(mockExchangeRateService.setRate).toHaveBeenCalledWith(botTelegramId, 950000n);

    worker.stop();
  });
});
