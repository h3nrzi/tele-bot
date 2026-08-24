import Decimal from 'decimal.js';

/**
 * Formats a USD amount string, Decimal, or number into a standard USD currency string (e.g. '$0.00').
 */
export function formatUsd(amount: string | Decimal | number): string {
  const dec = new Decimal(amount);
  return `$${dec.toFixed(2)}`;
}
