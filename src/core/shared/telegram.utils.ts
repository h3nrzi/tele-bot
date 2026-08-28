/**
 * Normalizes a Telegram Chat ID from number or bigint to bigint.
 */
export function normalizeChatId(chatId: bigint | number): bigint {
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
