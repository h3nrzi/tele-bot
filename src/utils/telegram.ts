/**
 * Normalizes a Telegram Chat ID from number or bigint to bigint.
 */
export function normalizeChatId(chatId: bigint | number): bigint {
  return typeof chatId === 'bigint' ? chatId : BigInt(chatId);
}
