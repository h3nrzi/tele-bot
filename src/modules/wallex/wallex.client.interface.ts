import type Decimal from 'decimal.js';
import type {
  WallexSide,
  WallexOtcQuote,
  WallexOtcOrderResult,
} from './wallex.types';

export interface WallexClient {
  /**
   * Fetches an OTC price quote for the given symbol and side.
   * Prices returned by the Wallex API in TMN are converted to IRR (× 10).
   */
  getOtcPrice(symbol: string, side: WallexSide): Promise<WallexOtcQuote>;

  /**
   * Places an OTC order for the given symbol, side, and quantity (POST /v1/account/easy-trade/orders).
   * All TMN values are converted to IRR (× 10) at this boundary.
   */
  placeOtcOrder(
    symbol: string,
    side: WallexSide,
    quantity: number | string | Decimal
  ): Promise<WallexOtcOrderResult>;
}
