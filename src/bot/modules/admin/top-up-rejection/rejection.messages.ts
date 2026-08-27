export function formatAdminRejectionOutcome(
  originalCaptionOrText: string,
  adminDisplay: string | number | bigint,
  rejectionReason: string
): string {
  return `${originalCaptionOrText}\n\n❌ رد شد توسط: ${adminDisplay}\nعلت: ${rejectionReason}`;
}

export function formatBuyerRejectionMessage(params: {
  rejectionReason: string;
}): string {
  return (
    `❌ درخواست افزایش موجودی شما رد شد.\n\n` +
    `علت رد درخواست:\n` +
    `${params.rejectionReason}\n\n` +
    `در صورت نیاز، لطفاً پس از رفع اشکال مجدداً با دستور /topup درخواست جدید ثبت کنید.`
  );
}

export function getRejectionReasonPromptMessage(): string {
  return 'لطفاً دلیل رد درخواست افزایش موجودی را انتخاب کنید یا گزینه دلیل دلخواه را بزنید:';
}

export function getCustomRejectionReasonPromptMessage(): string {
  return 'لطفاً توضیحات یا علت رد درخواست را به صورت پیام متنی ارسال کنید (یا برای انصراف /cancel را ارسال کنید):';
}

export function getRejectionCancelledMessage(): string {
  return '❌ عملیات رد درخواست لغو شد.';
}

export function getRejectionSuccessAdminMessage(reason: string): string {
  return `✅ درخواست با موفقیت رد شد.\nعلت: ${reason}`;
}
