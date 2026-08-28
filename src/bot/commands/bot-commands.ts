import type { Api } from 'grammy';
import type { BotCommand } from 'grammy/types';
import { resolveAdminIds } from '@/bot/middleware/admin.middleware';

export const BUYER_BOT_COMMANDS: BotCommand[] = [
  { command: 'start', description: '🏠 شروع و منوی اصلی' },
  { command: 'balance', description: '💰 مشاهده موجودی کیف پول' },
  { command: 'topup', description: '➕ افزایش موجودی کیف پول' },
  { command: 'status', description: '📋 پیگیری وضعیت آخرین درخواست' },
  { command: 'cancel', description: '❌ لغو درخواست افزایش موجودی جاری' },
];

export const ADMIN_BOT_COMMANDS: BotCommand[] = [
  { command: 'start', description: '🏠 پنل و منوی مدیریت' },
  { command: 'pending', description: '⏳ لیست درخواست‌های در انتظار تایید' },
  { command: 'setrate', description: '✏️ تنظیم نرخ لحظه‌ای تبدیل ارز (ریال به دلار)' },
  { command: 'rate', description: '💱 مشاهده نرخ تبدیل ارز فعال' },
  { command: 'setcard', description: '💳 تنظیم یا به‌روزرسانی کارت بانکی واریز' },
];

export async function setupBotCommands(
  api: Api,
  adminIdsSource?: string | Set<bigint>
): Promise<void> {
  // 1. Set default commands for all private chats (Buyers)
  await api.setMyCommands(BUYER_BOT_COMMANDS, {
    scope: { type: 'all_private_chats' },
  });

  // 2. Set default chat menu button to 'commands'
  await api.setChatMenuButton({
    menu_button: { type: 'commands' },
  });

  // 3. For each configured Admin, set admin command list and menu button scoped to their chat
  const adminIds = resolveAdminIds(adminIdsSource);
  for (const adminId of adminIds) {
    const chatId = Number(adminId);
    try {
      await api.setMyCommands(ADMIN_BOT_COMMANDS, {
        scope: { type: 'chat', chat_id: chatId },
      });
      await api.setChatMenuButton({
        chat_id: chatId,
        menu_button: { type: 'commands' },
      });
    } catch (err) {
      console.warn(`Failed to configure bot commands for admin ${adminId}:`, err);
    }
  }
}
