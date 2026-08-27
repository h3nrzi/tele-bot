import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDatabase } from '@tests/helpers/test-db';
import { createMockFetch } from '@tests/helpers/mock-context';
import { createBot } from '@/bot/bot';
import { bankAccounts } from '@/db/schema/bank-accounts';
import { setActiveAccount, getActiveAccount } from '@/application/bank-account/bank-account.service';
import {
  isValidCardNumber,
  cleanCardNumber,
  isCancelCommand,
  isSkipCommand,
  getCardNumberPromptMessage,
  getCardNumberErrorMessage,
  getCardHolderNamePromptMessage,
  getCardHolderNameErrorMessage,
  getBankNamePromptMessage,
  getBankNameErrorMessage,
  getAdditionalNotesPromptMessage,
  getSetCardCancelledMessage,
  getSetCardSuccessMessage,
} from '@/bot/modules/admin';
import { count } from 'drizzle-orm';

describe('/setcard Admin Command & Conversation', () => {
  const { db } = setupTestDatabase();
  const adminChatId = 123456789;
  const originalEnv = process.env.ADMIN_IDS;

  beforeEach(() => {
    process.env.ADMIN_IDS = `${adminChatId}`;
  });

  afterEach(() => {
    process.env.ADMIN_IDS = originalEnv;
  });

  function makeMessageUpdate(
    updateId: number,
    chatId: number,
    text: string,
    senderName = 'Admin'
  ) {
    const isCommand = text.startsWith('/');
    const commandLength = text.indexOf(' ') > 0 ? text.indexOf(' ') : text.length;

    const message: Record<string, unknown> = {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: 'private', first_name: senderName },
      from: { id: chatId, is_bot: false, first_name: senderName },
      text,
    };

    if (isCommand) {
      message.entities = [
        {
          offset: 0,
          length: commandLength,
          type: 'bot_command',
        },
      ];
    }

    return {
      update_id: updateId,
      message,
    } as any;
  }

  describe('Validation & Utility functions', () => {
    it('validates 16-digit card numbers with or without spaces/hyphens', () => {
      expect(isValidCardNumber('6037991234567890')).toBe(true);
      expect(isValidCardNumber('6037 9912 3456 7890')).toBe(true);
      expect(isValidCardNumber('6037-9912-3456-7890')).toBe(true);

      expect(isValidCardNumber('')).toBe(false);
      expect(isValidCardNumber('123456')).toBe(false);
      expect(isValidCardNumber('60379912345678901')).toBe(false);
      expect(isValidCardNumber('603799123456789a')).toBe(false);
    });

    it('cleans card number by removing whitespace and hyphens', () => {
      expect(cleanCardNumber('  6037 9912 3456 7890  ')).toBe('6037991234567890');
      expect(cleanCardNumber('6037-9912-3456-7890')).toBe('6037991234567890');
    });

    it('identifies cancel commands accurately', () => {
      expect(isCancelCommand('/cancel')).toBe(true);
      expect(isCancelCommand('/cancel@tele_bot')).toBe(true);
      expect(isCancelCommand('cancel')).toBe(true);
      expect(isCancelCommand('CANCEL')).toBe(true);
      expect(isCancelCommand('  cancel  ')).toBe(true);

      expect(isCancelCommand('6037991234567890')).toBe(false);
      expect(isCancelCommand('Ali Reza')).toBe(false);
    });

    it('identifies skip commands accurately', () => {
      expect(isSkipCommand('/skip')).toBe(true);
      expect(isSkipCommand('/skip@tele_bot')).toBe(true);
      expect(isSkipCommand('skip')).toBe(true);
      expect(isSkipCommand('SKIP')).toBe(true);
      expect(isSkipCommand('-')).toBe(true);
      expect(isSkipCommand('')).toBe(true);

      expect(isSkipCommand('Some note')).toBe(false);
    });

    it('formats success summary message properly', () => {
      const summaryWithoutNotes = getSetCardSuccessMessage({
        cardNumber: '6037991234567890',
        cardHolderName: 'Ali Reza',
        bankName: 'Mellat',
        additionalNotes: null,
      });
      expect(summaryWithoutNotes).toContain('6037991234567890');
      expect(summaryWithoutNotes).toContain('Ali Reza');
      expect(summaryWithoutNotes).toContain('Mellat');
      expect(summaryWithoutNotes).toContain('ندارد');

      const summaryWithNotes = getSetCardSuccessMessage({
        cardNumber: '6037991234567890',
        cardHolderName: 'Ali Reza',
        bankName: 'Mellat',
        additionalNotes: 'Transfer only from personal account',
      });
      expect(summaryWithNotes).toContain('Transfer only from personal account');
    });
  });

  describe('Bot conversation flow', () => {
    function createTestBot() {
      const repliedMessages: string[] = [];
      const { fetch: mockFetch } = createMockFetch(repliedMessages);
      const bot = createBot({
        token: 'test_token',
        dbClient: db,
        adminIds: `${adminChatId}`,
        client: {
          fetch: mockFetch,
        },
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
      return { bot, repliedMessages };
    }

    it('walks Admin through complete /setcard flow and activates account (with /skip notes)', async () => {
      const { bot, repliedMessages } = createTestBot();

      // Step 1: Send /setcard
      await bot.handleUpdate(makeMessageUpdate(1, adminChatId, '/setcard'));

      expect(repliedMessages).toHaveLength(1);
      expect(repliedMessages[0]).toBe(getCardNumberPromptMessage());

      // Step 2: Send valid 16-digit card number
      await bot.handleUpdate(makeMessageUpdate(2, adminChatId, '6037 9912 3456 7890'));

      expect(repliedMessages).toHaveLength(2);
      expect(repliedMessages[1]).toBe(getCardHolderNamePromptMessage());

      // Step 3: Send card holder name
      await bot.handleUpdate(makeMessageUpdate(3, adminChatId, 'Ali Reza'));

      expect(repliedMessages).toHaveLength(3);
      expect(repliedMessages[2]).toBe(getBankNamePromptMessage());

      // Step 4: Send bank name
      await bot.handleUpdate(makeMessageUpdate(4, adminChatId, 'Mellat Bank'));

      expect(repliedMessages).toHaveLength(4);
      expect(repliedMessages[3]).toBe(getAdditionalNotesPromptMessage());

      // Step 5: Send /skip for optional notes
      await bot.handleUpdate(makeMessageUpdate(5, adminChatId, '/skip'));

      expect(repliedMessages).toHaveLength(5);
      expect(repliedMessages[4]).toBe(
        getSetCardSuccessMessage({
          cardNumber: '6037991234567890',
          cardHolderName: 'Ali Reza',
          bankName: 'Mellat Bank',
          additionalNotes: null,
        })
      );

      const activeAccount = await getActiveAccount(db);
      expect(activeAccount).not.toBeNull();
      expect(activeAccount?.cardNumber).toBe('6037991234567890');
      expect(activeAccount?.cardHolderName).toBe('Ali Reza');
      expect(activeAccount?.bankName).toBe('Mellat Bank');
      expect(activeAccount?.additionalNotes).toBeNull();
      expect(activeAccount?.isActive).toBe(true);
    });

    it('collects optional additional notes when provided and deactivates prior account', async () => {
      // Setup prior active account
      await setActiveAccount(
        {
          cardNumber: '1111222233334444',
          cardHolderName: 'Old Holder',
          bankName: 'Old Bank',
          additionalNotes: 'Old notes',
        },
        db
      );

      const { bot, repliedMessages } = createTestBot();

      await bot.handleUpdate(makeMessageUpdate(1, adminChatId, '/setcard'));
      await bot.handleUpdate(makeMessageUpdate(2, adminChatId, '5022291012345678'));
      await bot.handleUpdate(makeMessageUpdate(3, adminChatId, 'Sara Smith'));
      await bot.handleUpdate(makeMessageUpdate(4, adminChatId, 'Pasargad'));
      await bot.handleUpdate(makeMessageUpdate(5, adminChatId, 'Include tracking ID in description'));

      expect(repliedMessages).toHaveLength(5);
      expect(repliedMessages[4]).toBe(
        getSetCardSuccessMessage({
          cardNumber: '5022291012345678',
          cardHolderName: 'Sara Smith',
          bankName: 'Pasargad',
          additionalNotes: 'Include tracking ID in description',
        })
      );

      const allRows = await db.select().from(bankAccounts);
      expect(allRows).toHaveLength(2);

      const oldAccount = allRows.find((r) => r.cardNumber === '1111222233334444');
      expect(oldAccount?.isActive).toBe(false);

      const activeAccount = await getActiveAccount(db);
      expect(activeAccount?.cardNumber).toBe('5022291012345678');
      expect(activeAccount?.cardHolderName).toBe('Sara Smith');
      expect(activeAccount?.bankName).toBe('Pasargad');
      expect(activeAccount?.additionalNotes).toBe('Include tracking ID in description');
      expect(activeAccount?.isActive).toBe(true);
    });

    it('re-prompts on invalid card number, empty card holder, and empty bank name', async () => {
      const { bot, repliedMessages } = createTestBot();

      // Enter flow
      await bot.handleUpdate(makeMessageUpdate(1, adminChatId, '/setcard'));
      expect(repliedMessages[0]).toBe(getCardNumberPromptMessage());

      // Invalid card number (short)
      await bot.handleUpdate(makeMessageUpdate(2, adminChatId, '12345'));
      expect(repliedMessages[1]).toBe(getCardNumberErrorMessage());

      // Valid card number
      await bot.handleUpdate(makeMessageUpdate(3, adminChatId, '6037991234567890'));
      expect(repliedMessages[2]).toBe(getCardHolderNamePromptMessage());

      // Empty / whitespace holder name
      await bot.handleUpdate(makeMessageUpdate(4, adminChatId, '   '));
      expect(repliedMessages[3]).toBe(getCardHolderNameErrorMessage());

      // Valid holder name
      await bot.handleUpdate(makeMessageUpdate(5, adminChatId, 'John Doe'));
      expect(repliedMessages[4]).toBe(getBankNamePromptMessage());

      // Empty bank name
      await bot.handleUpdate(makeMessageUpdate(6, adminChatId, ''));
      expect(repliedMessages[5]).toBe(getBankNameErrorMessage());

      // Valid bank name
      await bot.handleUpdate(makeMessageUpdate(7, adminChatId, 'Tejarat'));
      expect(repliedMessages[6]).toBe(getAdditionalNotesPromptMessage());

      // Skip notes
      await bot.handleUpdate(makeMessageUpdate(8, adminChatId, 'skip'));
      expect(repliedMessages[7]).toBe(
        getSetCardSuccessMessage({
          cardNumber: '6037991234567890',
          cardHolderName: 'John Doe',
          bankName: 'Tejarat',
          additionalNotes: null,
        })
      );
    });

    it('cancels the conversation at step 1 (card number)', async () => {
      const { bot, repliedMessages } = createTestBot();

      await bot.handleUpdate(makeMessageUpdate(1, adminChatId, '/setcard'));
      await bot.handleUpdate(makeMessageUpdate(2, adminChatId, '/cancel'));

      expect(repliedMessages).toHaveLength(2);
      expect(repliedMessages[1]).toBe(getSetCardCancelledMessage());

      const [countResult] = await db.select({ value: count() }).from(bankAccounts);
      expect(Number(countResult?.value ?? 0)).toBe(0);
    });

    it('cancels the conversation at step 2 (card holder name)', async () => {
      const { bot, repliedMessages } = createTestBot();

      await bot.handleUpdate(makeMessageUpdate(1, adminChatId, '/setcard'));
      await bot.handleUpdate(makeMessageUpdate(2, adminChatId, '6037991234567890'));
      await bot.handleUpdate(makeMessageUpdate(3, adminChatId, 'cancel'));

      expect(repliedMessages).toHaveLength(3);
      expect(repliedMessages[2]).toBe(getSetCardCancelledMessage());

      const [countResult] = await db.select({ value: count() }).from(bankAccounts);
      expect(Number(countResult?.value ?? 0)).toBe(0);
    });

    it('cancels the conversation at step 3 (bank name)', async () => {
      const { bot, repliedMessages } = createTestBot();

      await bot.handleUpdate(makeMessageUpdate(1, adminChatId, '/setcard'));
      await bot.handleUpdate(makeMessageUpdate(2, adminChatId, '6037991234567890'));
      await bot.handleUpdate(makeMessageUpdate(3, adminChatId, 'Ali Reza'));
      await bot.handleUpdate(makeMessageUpdate(4, adminChatId, '/cancel'));

      expect(repliedMessages).toHaveLength(4);
      expect(repliedMessages[3]).toBe(getSetCardCancelledMessage());

      const [countResult] = await db.select({ value: count() }).from(bankAccounts);
      expect(Number(countResult?.value ?? 0)).toBe(0);
    });

    it('cancels the conversation at step 4 (additional notes)', async () => {
      const { bot, repliedMessages } = createTestBot();

      await bot.handleUpdate(makeMessageUpdate(1, adminChatId, '/setcard'));
      await bot.handleUpdate(makeMessageUpdate(2, adminChatId, '6037991234567890'));
      await bot.handleUpdate(makeMessageUpdate(3, adminChatId, 'Ali Reza'));
      await bot.handleUpdate(makeMessageUpdate(4, adminChatId, 'Mellat'));
      await bot.handleUpdate(makeMessageUpdate(5, adminChatId, '/cancel'));

      expect(repliedMessages).toHaveLength(5);
      expect(repliedMessages[4]).toBe(getSetCardCancelledMessage());

      const [countResult] = await db.select({ value: count() }).from(bankAccounts);
      expect(Number(countResult?.value ?? 0)).toBe(0);
    });

    it('silently ignores /setcard when sent by a non-Admin', async () => {
      const nonAdminChatId = 999888777;
      const { bot, repliedMessages } = createTestBot();

      await bot.handleUpdate(makeMessageUpdate(1, nonAdminChatId, '/setcard', 'Buyer'));

      expect(repliedMessages).toHaveLength(0);
      const [countResult] = await db.select({ value: count() }).from(bankAccounts);
      expect(Number(countResult?.value ?? 0)).toBe(0);
    });
  });
});
