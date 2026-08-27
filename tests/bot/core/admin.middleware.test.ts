import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Context, NextFunction } from 'grammy';
import {
  adminMiddleware,
  createAdminMiddleware,
  parseAdminIds,
  isAdmin,
} from '../../../src/bot/core/middleware/admin.middleware';
import { createMockContext } from '../../helpers/mock-context';
import { createBot } from '../../../src/bot/bot';

describe('Admin Middleware', () => {
  const originalEnv = process.env.ADMIN_IDS;

  beforeEach(() => {
    process.env.ADMIN_IDS = '123456789,987654321';
  });

  afterEach(() => {
    process.env.ADMIN_IDS = originalEnv;
  });

  describe('parseAdminIds', () => {
    it('parses single ID correctly', () => {
      const ids = parseAdminIds('123456789');
      expect(ids).toEqual(new Set([123456789n]));
    });

    it('parses comma-separated IDs with arbitrary whitespace', () => {
      const ids = parseAdminIds(' 123456789 ,  987654321 , 1122334455 ');
      expect(ids).toEqual(new Set([123456789n, 987654321n, 1122334455n]));
    });

    it('returns empty set for undefined, empty, or whitespace-only string', () => {
      expect(parseAdminIds(undefined)).toEqual(new Set());
      expect(parseAdminIds('')).toEqual(new Set());
      expect(parseAdminIds('   ')).toEqual(new Set());
    });

    it('skips non-numeric tokens safely without throwing', () => {
      const ids = parseAdminIds('123456789, invalid, 987654321, abc');
      expect(ids).toEqual(new Set([123456789n, 987654321n]));
    });
  });

  describe('isAdmin', () => {
    it('returns true if sender ID is in ADMIN_IDS', () => {
      expect(isAdmin(123456789, '123456789,987654321')).toBe(true);
      expect(isAdmin(987654321n, '123456789,987654321')).toBe(true);
    });

    it('returns false if sender ID is not in ADMIN_IDS', () => {
      expect(isAdmin(555555555, '123456789,987654321')).toBe(false);
    });

    it('returns false if sender ID is undefined or null', () => {
      expect(isAdmin(undefined, '123456789,987654321')).toBe(false);
      expect(isAdmin(null, '123456789,987654321')).toBe(false);
    });

    it('defaults to process.env.ADMIN_IDS when no custom IDs passed', () => {
      expect(isAdmin(123456789)).toBe(true);
      expect(isAdmin(555555555)).toBe(false);
    });
  });

  describe('adminMiddleware', () => {
    it('calls next() when update is from an Admin', async () => {
      const { ctx } = createMockContext({ id: 123456789, username: 'alice_admin' });
      const next = vi.fn<NextFunction>(async () => {});

      await adminMiddleware(ctx, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('silently drops update and does not call next() when update is from a non-Admin', async () => {
      const { ctx, repliedMessages } = createMockContext({ id: 555555555, username: 'bob_buyer' });
      const next = vi.fn<NextFunction>(async () => {});

      await adminMiddleware(ctx, next);

      expect(next).not.toHaveBeenCalled();
      expect(ctx.reply).not.toHaveBeenCalled();
      expect(repliedMessages).toHaveLength(0);
    });

    it('silently drops update when ctx.from is undefined', async () => {
      const { ctx } = createMockContext(undefined);
      const next = vi.fn<NextFunction>(async () => {});

      await adminMiddleware(ctx, next);

      expect(next).not.toHaveBeenCalled();
      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it('supports custom admin IDs via createAdminMiddleware', async () => {
      const customMiddleware = createAdminMiddleware({ adminIds: '777888999' });
      const next = vi.fn<NextFunction>(async () => {});

      const { ctx: adminCtx } = createMockContext({ id: 777888999 });
      await customMiddleware(adminCtx, next);
      expect(next).toHaveBeenCalledTimes(1);

      const { ctx: nonAdminCtx } = createMockContext({ id: 123456789 });
      await customMiddleware(nonAdminCtx, next);
      expect(next).toHaveBeenCalledTimes(1); // Not called again
    });
  });

  describe('Bot integration with Admin middleware', () => {
    it('allows Admin to execute command and silently drops non-Admin command', async () => {
      const bot = createBot({
        token: 'test_token',
        botInfo: {
          id: 1000,
          is_bot: true,
          first_name: 'TeleBot',
          username: 'tele_bot',
          can_join_groups: true,
          can_read_all_group_messages: false,
          supports_inline_queries: false,
        } as any,
      });

      const executedAdminHandler = vi.fn(async (ctx: Context) => {
        await ctx.reply('Admin action executed');
      });

      // Register an admin-protected command using adminMiddleware
      bot.command('admin_only', adminMiddleware, executedAdminHandler);

      const repliedMessages: string[] = [];
      bot.api.config.use(async (prev: any, method: string, payload: any, signal: any) => {
        if (method === 'sendMessage') {
          repliedMessages.push(payload.text);
          return {
            ok: true,
            result: {
              message_id: 1,
              date: Date.now(),
              chat: { id: payload.chat_id, type: 'private' },
              text: payload.text,
            },
          } as any;
        }
        return prev(method, payload, signal);
      });

      // 1. Non-admin sender sends /admin_only
      await bot.handleUpdate({
        update_id: 1,
        message: {
          message_id: 1,
          date: Math.floor(Date.now() / 1000),
          chat: { id: 555555555, type: 'private', first_name: 'Bob' },
          from: { id: 555555555, is_bot: false, first_name: 'Bob' },
          text: '/admin_only',
          entities: [{ offset: 0, length: 11, type: 'bot_command' }],
        },
      });

      expect(executedAdminHandler).not.toHaveBeenCalled();
      expect(repliedMessages).toHaveLength(0);

      // 2. Admin sender sends /admin_only
      await bot.handleUpdate({
        update_id: 2,
        message: {
          message_id: 2,
          date: Math.floor(Date.now() / 1000),
          chat: { id: 123456789, type: 'private', first_name: 'Alice' },
          from: { id: 123456789, is_bot: false, first_name: 'Alice' },
          text: '/admin_only',
          entities: [{ offset: 0, length: 11, type: 'bot_command' }],
        },
      });

      expect(executedAdminHandler).toHaveBeenCalledTimes(1);
      expect(repliedMessages).toHaveLength(1);
      expect(repliedMessages[0]).toBe('Admin action executed');
    });
  });
});
