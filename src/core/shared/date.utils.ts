export interface FormatPersianDateTimeOptions {
  /**
   * Whether to include the seconds part (default: true).
   */
  includeSeconds?: boolean;
  /**
   * The separator string between the date and time parts (default: ' ').
   */
  separator?: string;
  /**
   * Whether to use Persian digits (e.g. ۱۴۰۵) instead of Latin digits (e.g. 1405) (default: false).
   */
  usePersianDigits?: boolean;
}

/**
 * Formats a Date (or ISO date string / timestamp) into Persian (Solar Hijri / Shamsi)
 * date and time in the Asia/Tehran timezone (e.g. '1405/06/11 12:15:05').
 */
export function formatPersianDateTime(
  date: Date | string | number | null | undefined,
  options: FormatPersianDateTimeOptions = {}
): string {
  if (!date) {
    return '';
  }

  const d =
    typeof date === 'string' || typeof date === 'number'
      ? new Date(date)
      : date;

  if (!(d instanceof Date) || isNaN(d.getTime())) {
    return '';
  }

  const {
    includeSeconds = true,
    separator = ' ',
    usePersianDigits = false,
  } = options;
  const locale = usePersianDigits ? 'fa-IR' : 'fa-IR-u-ca-persian-nu-latn';

  const formatter = new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(d).reduce<Record<string, string>>(
    (acc, part) => {
      acc[part.type] = part.value;
      return acc;
    },
    {}
  );

  const datePart = `${parts.year}/${parts.month}/${parts.day}`;
  const timePart = includeSeconds
    ? `${parts.hour}:${parts.minute}:${parts.second}`
    : `${parts.hour}:${parts.minute}`;

  return `${datePart}${separator}${timePart}`;
}

/**
 * Formats a Date into Persian date only (e.g. '1405/06/11').
 */
export function formatPersianDate(
  date: Date | string | number | null | undefined,
  options?: Pick<FormatPersianDateTimeOptions, 'usePersianDigits'>
): string {
  return formatPersianDateTime(date, {
    ...options,
    includeSeconds: false,
  }).split(' ')[0] ?? '';
}

/**
 * Formats a Date into Persian time only (e.g. '12:15:05' or '12:15').
 */
export function formatPersianTime(
  date: Date | string | number | null | undefined,
  options?: Pick<FormatPersianDateTimeOptions, 'includeSeconds' | 'usePersianDigits'>
): string {
  const formatted = formatPersianDateTime(date, options);
  const parts = formatted.split(' ');
  return parts.length > 1 ? parts[1]! : '';
}

/**
 * Formats relative time elapsed in Persian (e.g. 'لحظاتی پیش', '۵ دقیقه پیش', '۲ ساعت پیش', '۱ روز پیش').
 */
export function formatTimeAgo(
  date: Date | string | number,
  now: Date = new Date()
): string {
  const d =
    typeof date === 'string' || typeof date === 'number'
      ? new Date(date)
      : date;

  if (!(d instanceof Date) || isNaN(d.getTime())) {
    return '';
  }

  const diffMs = Math.max(0, now.getTime() - d.getTime());
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) {
    return 'لحظاتی پیش';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} دقیقه پیش`;
  }
  if (diffHours < 24) {
    return `${diffHours} ساعت پیش`;
  }
  return `${diffDays} روز پیش`;
}
