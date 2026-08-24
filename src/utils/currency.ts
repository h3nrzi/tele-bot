import Decimal from 'decimal.js';

/**
 * Formats a USD amount string or Decimal into a standard USD currency string (e.g. '$0.00').
 */
export function formatUsd(amount: string | Decimal): string {
  const dec = typeof amount === 'string' ? new Decimal(amount) : amount;
  return `$${dec.toFixed(2)}`;
}
