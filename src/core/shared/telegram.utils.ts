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


