import type { OtcPurchase } from "./otc-purchase.entity";

export interface IOtcPurchaseRepository<TExecutor = unknown> {
	/**
	 * Inserts a new OtcPurchase record.
	 * Throws DuplicateActiveOtcPurchaseError if a PENDING or COMPLETED purchase
	 * already exists for the same topUpRequestId.
	 */
	insert(purchase: OtcPurchase, executor?: TExecutor): Promise<OtcPurchase>;

	/**
	 * Updates an existing OtcPurchase record (status, Wallex execution details, error, updatedAt).
	 */
	update(purchase: OtcPurchase, executor?: TExecutor): Promise<OtcPurchase>;

	/**
	 * Finds an OtcPurchase record by its unique ID.
	 */
	findById(id: string, executor?: TExecutor): Promise<OtcPurchase | null>;

	/**
	 * Finds all OtcPurchase records associated with a given Top-Up Request ID, ordered by createdAt asc.
	 */
	findByTopUpRequestId(topUpRequestId: string, executor?: TExecutor): Promise<OtcPurchase[]>;

	/**
	 * Finds the active (PENDING or COMPLETED) OtcPurchase for a given Top-Up Request ID, if any.
	 */
	findActiveByTopUpRequestId(topUpRequestId: string, executor?: TExecutor): Promise<OtcPurchase | null>;
}
