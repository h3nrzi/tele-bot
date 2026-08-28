/**
 * Message returned when a top-up request is successfully cancelled.
 */
export function getCancelSuccessMessage(): string {
  return 'درخواست افزایش موجودی شما با موفقیت لغو شد.';
}

/**
 * Message returned when buyer attempts to cancel a request that has already progressed to PENDING (receipt submitted).
 */
export function getCannotCancelPendingMessage(): string {
  return 'امکان لغو این درخواست وجود ندارد زیرا رسید پرداخت ارسال شده است. لطفاً منتظر بررسی ادمین باشید.';
}

/**
 * Message returned when buyer attempts to cancel but has no active top-up request.
 */
export function getNoActiveRequestToCancelMessage(): string {
  return 'شما در حال حاضر هیچ درخواست افزایش موجودی فعالی برای لغو ندارید.';
}
