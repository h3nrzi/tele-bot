import { formatUsd } from '@/utils/currency';

/**
 * Returns the welcome message for a newly registered Buyer.
 */
export function getNewBuyerWelcomeMessage(): string {
  return 'به Tele-Bot خوش آمدید! کیف پول شما ایجاد شد. موجودی در دسترس شما $0.00 است.';
}

/**
 * Returns the personalised greeting message for a returning Buyer with their Available Balance.
 */
export function getReturningBuyerWelcomeMessage(
  name: string | null | undefined,
  availableBalance: string
): string {
  const greetingName = name && name.trim().length > 0 ? ` ${name.trim()}` : '';
  return `خوش آمدید${greetingName}! موجودی در دسترس شما ${formatUsd(availableBalance)} است.`;
}

/**
 * Returns the welcome message for an Admin operator accessing the management panel.
 */
export function getAdminWelcomeMessage(name?: string | null | undefined): string {
  const greetingName = name && name.trim().length > 0 ? ` ${name.trim()}` : '';
  return `🔐 به پنل مدیریت Tele-Bot خوش آمدید${greetingName}!\n\nاز منوی زیر می‌توانید عملیات‌های مدیریتی را انجام دهید:\n• بررسی درخواست‌های در انتظار (/pending)\n• تنظیم اطلاعات کارت بانکی (/setcard)\n• مشاهده نرخ ارز فعلی (/rate)\n• تنظیم نرخ ارز (/setrate)`;
}
