export function getReceiptSubmittedBuyerMessage(): string {
  return 'رسید پرداخت شما با موفقیت ثبت شد و برای بررسی ارسال گردید. نتیجه از طریق همین پیام‌رسان به شما اعلام خواهد شد.';
}

export function getReceiptExpiredMessage(): string {
  return 'مهلت پرداخت درخواست افزایش موجودی شما به پایان رسیده است. لطفاً با دستور /topup یک درخواست جدید ثبت کنید.';
}

export function getReceiptAlreadyPendingMessage(): string {
  return 'شما قبلاً رسید پرداخت خود را ارسال کرده‌اید و درخواست شما در انتظار بررسی ادمین است.';
}

export function getNoActiveTopUpRequestMessage(): string {
  return 'شما در حال حاضر هیچ درخواست افزایش موجودی فعالی ندارید. برای شروع افزایش موجودی، دستور /topup را ارسال کنید.';
}
