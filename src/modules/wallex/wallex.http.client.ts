import Decimal from 'decimal.js';
import type {
  WallexClient,
} from './wallex.client.interface';
import type {
  WallexSide,
  WallexOtcQuote,
  WallexOtcOrderResult,
} from './wallex.types';
import type { WallexConfig } from './wallex.config';
import {
  WallexError,
  WallexAuthError,
  WallexRateLimitError,
  WallexMaintenanceError,
  WallexNetworkError,
  WallexBadResponseError,
  WallexApiError,
} from './wallex.errors';

function classifyWallexError(
  message: string,
  statusCode?: number,
  body?: unknown
): WallexError {
  const lowerMsg = String(message).toLowerCase();

  if (
    statusCode === 401 ||
    statusCode === 403 ||
    lowerMsg.includes('unauthorized') ||
    lowerMsg.includes('api key')
  ) {
    return new WallexAuthError(message);
  }

  if (
    statusCode === 429 ||
    lowerMsg.includes('rate limit') ||
    lowerMsg.includes('too many requests')
  ) {
    return new WallexRateLimitError(message);
  }

  if (
    statusCode === 503 ||
    statusCode === 502 ||
    statusCode === 504 ||
    lowerMsg.includes('maintenance')
  ) {
    return new WallexMaintenanceError(message);
  }

  return new WallexApiError(message, statusCode, body);
}

export class WallexHttpClient implements WallexClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(config: WallexConfig, fetchFn?: typeof fetch) {
    if (!config.apiKey || config.apiKey.trim() === '') {
      throw new Error('WALLEX_API_KEY is required');
    }
    this.apiKey = config.apiKey.trim();
    this.baseUrl = (config.baseUrl || 'https://api.wallex.ir').trim().replace(/\/+$/, '');
    this.fetchFn = fetchFn ?? globalThis.fetch;
  }

  /**
   * Fetches an OTC price quote from Wallex (GET /v1/account/otc/price?symbol=...&side=...).
   * Converts the returned TMN price to IRR (× 10) before returning to the caller.
   */
  public async getOtcPrice(symbol: string, side: WallexSide): Promise<WallexOtcQuote> {
    const url = `${this.baseUrl}/v1/account/otc/price?symbol=${encodeURIComponent(symbol)}&side=${encodeURIComponent(side)}`;

    const response = await this.request(url, {
      method: 'GET',
    });

    const data = await this.parseJsonSafe(response);

    // Wallex may return { result: { price, ... } } or { price: ... }
    const resultObj = data?.result ?? data;
    const rawPrice = resultObj?.price ?? resultObj?.quotePrice;

    if (rawPrice === undefined || rawPrice === null || rawPrice === '') {
      throw new WallexBadResponseError(
        `Wallex price quote missing 'price' field in response: ${JSON.stringify(data)}`
      );
    }

    let priceDecimal: Decimal;
    try {
      priceDecimal = new Decimal(rawPrice);
      if (priceDecimal.isNaN() || !priceDecimal.isFinite()) {
        throw new Error('Invalid decimal price');
      }
    } catch {
      throw new WallexBadResponseError(
        `Wallex price quote has invalid numeric price '${rawPrice}'`
      );
    }

    // Convert TMN to IRR (× 10) at the adapter boundary
    const priceIrr = BigInt(priceDecimal.times(10).round().toFixed(0));

    const ttl = resultObj?.ttl ?? resultObj?.ttlSeconds;
    const ttlSeconds = typeof ttl === 'number' ? ttl : ttl ? parseInt(ttl, 10) : undefined;

    return {
      symbol: resultObj?.symbol ?? symbol,
      side: (resultObj?.side ?? side) as WallexSide,
      priceIrr,
      ttlSeconds: Number.isNaN(ttlSeconds) ? undefined : ttlSeconds,
      raw: data,
    };
  }

  /**
   * Places an OTC order (POST /v1/account/easy-trade/orders).
   * All TMN values (price, sum, fee) are converted to IRR (× 10) at the adapter boundary.
   */
  public async placeOtcOrder(
    symbol: string,
    side: WallexSide,
    quantity: number | string | Decimal
  ): Promise<WallexOtcOrderResult> {
    const url = `${this.baseUrl}/v1/account/easy-trade/orders`;
    const qtyDecimal = quantity instanceof Decimal ? quantity : new Decimal(quantity);
    const qtyNumber = qtyDecimal.toNumber();

    const requestPayload = {
      symbol,
      side,
      quantity: qtyNumber,
      from: 'otc',
    };

    const response = await this.request(url, {
      method: 'POST',
      body: JSON.stringify(requestPayload),
    });

    const data = await this.parseJsonSafe(response);
    const resultObj = data?.result ?? data;

    const clientOrderId =
      resultObj?.clientOrderId ??
      resultObj?.client_order_id ??
      resultObj?.orderId ??
      resultObj?.order_id ??
      resultObj?.id;

    if (!clientOrderId) {
      throw new WallexBadResponseError(
        `Wallex order response missing order ID: ${JSON.stringify(data)}`
      );
    }

    const rawExecutedPrice =
      resultObj?.executedPrice ?? resultObj?.executed_price ?? resultObj?.price;
    const rawExecutedQty =
      resultObj?.executedQty ??
      resultObj?.executed_qty ??
      resultObj?.quantity ??
      resultObj?.origQty ??
      qtyNumber;
    const rawExecutedSum =
      resultObj?.executedSum ?? resultObj?.executed_sum ?? resultObj?.sum;
    const rawFee = resultObj?.fee ?? resultObj?.commission ?? 0;

    if (rawExecutedPrice === undefined || rawExecutedPrice === null) {
      throw new WallexBadResponseError(
        `Wallex order response missing executedPrice: ${JSON.stringify(data)}`
      );
    }

    const executedPriceDec = new Decimal(rawExecutedPrice);
    const executedQtyDec = new Decimal(rawExecutedQty);
    const executedSumDec =
      rawExecutedSum !== undefined && rawExecutedSum !== null
        ? new Decimal(rawExecutedSum)
        : executedPriceDec.times(executedQtyDec);
    const feeDec = new Decimal(rawFee);

    // Convert TMN to IRR (× 10) at boundary
    const executedPriceIrr = BigInt(executedPriceDec.times(10).round().toFixed(0));
    const executedSumIrr = BigInt(executedSumDec.times(10).round().toFixed(0));
    const feeIrr = BigInt(feeDec.times(10).round().toFixed(0));

    return {
      clientOrderId: String(clientOrderId),
      executedPriceIrr,
      executedQty: executedQtyDec.toString(),
      executedSumIrr,
      feeIrr,
      raw: data,
    };
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    const headers: Record<string, string> = {
      'x-api-key': this.apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers as Record<string, string>),
    };

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        ...init,
        headers,
      });
    } catch (err: unknown) {
      throw new WallexNetworkError(
        `Network error while requesting ${url}: ${err instanceof Error ? err.message : String(err)}`,
        err
      );
    }

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    return response;
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    const status = response.status;
    let body: any = null;
    let rawText = '';

    try {
      rawText = await response.text();
      body = JSON.parse(rawText);
    } catch {
      body = rawText || null;
    }

    const message =
      typeof body === 'object' && body !== null
        ? body.message || body.error || JSON.stringify(body)
        : typeof body === 'string' && body.trim() !== ''
          ? body
          : `HTTP ${status}`;

    throw classifyWallexError(message, status, body);
  }

  private async parseJsonSafe(response: Response): Promise<any> {
    let rawText = '';
    try {
      rawText = await response.text();
      const data = JSON.parse(rawText);
      if (typeof data === 'object' && data !== null && 'success' in data && (data as any).success === false) {
        const errorMsg = (data as any).message || (data as any).error || 'Wallex API returned success: false';
        throw classifyWallexError(errorMsg, response.status, data);
      }
      return data;
    } catch (err: unknown) {
      if (err instanceof WallexError) {
        throw err;
      }
      throw new WallexBadResponseError(
        `Failed to parse response from Wallex: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}
