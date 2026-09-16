import type { OtcPurchase } from "./otc-purchase.entity";

export interface IOtcPurchaseNotifier {
	/**
	 * Sends a success notification for a completed OTC purchase.
	 */
	notifySuccess(purchase: OtcPurchase): Promise<void>;

	/**
	 * Sends a failure notification for a failed OTC purchase, including error message and retry button.
	 */
	notifyFailure(purchase: OtcPurchase, error?: string): Promise<void>;
}
