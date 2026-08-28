import { formatUsd } from '@/core/shared/currency.utils';
import type { UsdAmount } from '@/core/shared/money.vo';
import type Decimal from 'decimal.js';

export function getNewBuyerWelcomeMessage(): string {
  return (
    `سلام! به Tele-Bot خوش آمدید.\n\n` +
    `کیف پول شما با موفقیت ایجاد شد.\n` +
    `موجودی فعلی شما: ${formatUsd('0.00')}\n\n` +
    `از دکمه‌های زیر برای دسترسی به امکانات استفاده کنید.`
  );
}

export function getReturningBuyerWelcomeMessage(
  displayName: string | null,
  availableBalance: string | Decimal | UsdAmount
): string {
  const greeting = displayName ? `سلام ${displayName} عزیز!` : `سلام!`;

  return (
    `${greeting}\nبه Tele-Bot خوش آمدید.\n\n` +
    `موجودی کیف پول شما: ${formatUsd(availableBalance)}\n\n` +
    `از منوی زیر گزینه مورد نظر خود را انتخاب کنید:`
  );
}

export function getAdminWelcomeMessage(displayName: string | null): string {
  const greeting = displayName ? `سلام ${displayName} (ادمین گرامی)!` : `سلام ادمین گرامی!`;

  return (
    `${greeting}\nبه پنل مدیریت Tele-Bot خوش آمدید.\n\n` +
    `از منوی زیر می‌توانید نرخ ارز، کارت بانکی و صف درخواست‌های افزایش موجودی را مدیریت کنید:`
  );
}
