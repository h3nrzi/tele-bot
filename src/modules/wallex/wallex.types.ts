import type Decimal from "decimal.js";

export type WallexSide = "BUY" | "SELL";

export interface WallexOtcQuote {
	symbol: string;
	side: WallexSide;
	priceIrr: bigint;
	ttlSeconds?: number | undefined;
	raw?: unknown;
}

export interface WallexOtcOrderResult {
	clientOrderId: string;
	executedPriceIrr: bigint;
	executedQty: string;
	executedSumIrr: bigint;
	feeIrr: bigint;
	raw?: unknown;
}
