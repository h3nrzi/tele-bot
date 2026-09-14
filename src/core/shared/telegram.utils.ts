/**
 * Normalizes a Telegram Chat ID from number, bigint, or string to bigint.
 */
export function normalizeChatId(chatId: bigint | number | string): bigint {
  return typeof chatId === 'bigint' ? chatId : BigInt(chatId);
}

/**
 * Checks if the message text is a cancel command (/cancel or cancel).
 */
export function isCancelCommand(raw: string): boolean {
  if (!raw) {
    return false;
  }
  const trimmed = raw.trim();
  return (
    /^\/cancel(@\w+)?$/i.test(trimmed) ||
    trimmed.toLowerCase() === 'cancel' ||
    trimmed === 'انصراف' ||
    trimmed === 'لغو' ||
    trimmed === '❌ انصراف' ||
    trimmed === '❌ لغو' ||
    trimmed === '❌ لغو درخواست' ||
    trimmed === 'لغو درخواست'
  );
}

/**
 * Validates whether a string is a valid UUID v4 format.
 */
export function isValidUuid(id: string): boolean {
  if (!id) {
    return false;
  }
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id
  );
}

/**
 * Escapes special Telegram Markdown (legacy v1) characters in dynamic text.
 * Characters '_', '*', '`', '[' and '\' are escaped with a preceding backslash.
 */
export function escapeMarkdown(text: string): string {
  if (!text) {
    return '';
  }
  return text.replace(/([\\_*`\[])/g, '\\$1');
}

/**
 * Extracts the numerical bot Telegram ID from a Telegram Bot API token.
 * Telegram Bot API tokens are formatted as `<bot_id>:<token_secret>`.
 */
export function parseBotIdFromToken(token?: string | null): bigint | null {
  if (!token) {
    return null;
  }
  const match = token.trim().match(/^(\d+):/);
  if (!match || !match[1]) {
    return null;
  }
  return BigInt(match[1]);
}


