import { describe, it, expect, vi } from "vitest";
import { WallexHttpClient } from "@/modules/wallex/wallex.http.client";
import {
	WallexAuthError,
	WallexRateLimitError,
	WallexMaintenanceError,
	WallexNetworkError,
	WallexBadResponseError,
	WallexApiError,
} from "@/modules/wallex/wallex.errors";
import { WallexConfigVo } from "@/modules/wallex/wallex.config";

describe("WallexClient (HTTP Adapter)", () => {
	const dummyApiKey = "test-wallex-api-key-12345";
	const dummyBaseUrl = "https://api.wallex.ir";

	describe("Slice 1: Price Quote (getOtcPrice)", () => {
		it("fetches an OTC price quote with x-api-key and converts TMN to IRR (× 10)", async () => {
			const mockFetch = vi.fn().mockResolvedValue(
				new Response(
					JSON.stringify({
						result: {
							symbol: "USDTTMN",
							side: "BUY",
							price: "90500",
							ttl: 15,
						},
						success: true,
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
			);

			const client = new WallexHttpClient({ apiKey: dummyApiKey, baseUrl: dummyBaseUrl }, mockFetch);

			const quote = await client.getOtcPrice("USDTTMN", "BUY");

			// Assert fetch was called with correct URL, method, and headers
			expect(mockFetch).toHaveBeenCalledTimes(1);
			const firstCall = mockFetch.mock.calls[0];
			expect(firstCall).toBeDefined();
			const [url, init] = firstCall!;
			expect(url).toBe("https://api.wallex.ir/v1/account/otc/price?symbol=USDTTMN&side=BUY");
			expect(init?.method).toBe("GET");
			expect(init?.headers).toMatchObject({
				"x-api-key": dummyApiKey,
			});

			// Assert quote values and TMN to IRR conversion (90,500 TMN × 10 = 905,000 IRR)
			expect(quote.symbol).toBe("USDTTMN");
			expect(quote.side).toBe("BUY");
			expect(quote.priceIrr).toBe(905000n);
			expect(quote.ttlSeconds).toBe(15);
		});

		it("converts numeric and decimal TMN prices to IRR accurately", async () => {
			const mockFetch = vi.fn().mockResolvedValue(
				new Response(
					JSON.stringify({
						result: {
							symbol: "USDTTMN",
							side: "BUY",
							price: 90500.5,
						},
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
			);

			const client = new WallexHttpClient({ apiKey: dummyApiKey, baseUrl: dummyBaseUrl }, mockFetch);

			const quote = await client.getOtcPrice("USDTTMN", "BUY");
			// 90500.5 * 10 = 905005 IRR
			expect(quote.priceIrr).toBe(905005n);
		});
	});

	describe("Slice 2: Order Placement (placeOtcOrder)", () => {
		it("sends POST /v1/account/easy-trade/orders with otc flag and converts TMN to IRR (× 10)", async () => {
			const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
				expect(url).toBe("https://api.wallex.ir/v1/account/easy-trade/orders");
				expect(init?.method).toBe("POST");
				expect(init?.headers).toMatchObject({
					"x-api-key": dummyApiKey,
				});

				const body = JSON.parse(init?.body as string);
				expect(body).toEqual({
					symbol: "USDTTMN",
					side: "BUY",
					quantity: 100,
					from: "otc",
				});

				return new Response(
					JSON.stringify({
						result: {
							clientOrderId: "wallex-order-98765",
							executedPrice: "90500",
							executedQty: "100",
							executedSum: "9050000",
							fee: "9050",
						},
						success: true,
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				);
			});

			const client = new WallexHttpClient({ apiKey: dummyApiKey, baseUrl: dummyBaseUrl }, mockFetch);

			const result = await client.placeOtcOrder("USDTTMN", "BUY", 100);

			expect(mockFetch).toHaveBeenCalledTimes(1);

			// Verify TMN -> IRR conversion (x 10)
			// executedPrice: 90,500 TMN -> 905,000 IRR
			expect(result.executedPriceIrr).toBe(905000n);
			// executedQty: 100 USDT
			expect(result.executedQty).toBe("100");
			// executedSum: 9,050,000 TMN -> 90,500,000 IRR
			expect(result.executedSumIrr).toBe(90500000n);
			// fee: 9,050 TMN -> 90,500 IRR
			expect(result.feeIrr).toBe(90500n);
			// clientOrderId
			expect(result.clientOrderId).toBe("wallex-order-98765");
		});

		it("derives executedSumIrr if executedSum is omitted in Wallex response", async () => {
			const mockFetch = vi.fn().mockResolvedValue(
				new Response(
					JSON.stringify({
						result: {
							clientOrderId: "wallex-order-derive",
							executedPrice: "91000",
							executedQty: "20",
							// executedSum missing
						},
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
			);

			const client = new WallexHttpClient({ apiKey: dummyApiKey, baseUrl: dummyBaseUrl }, mockFetch);

			const result = await client.placeOtcOrder("USDTTMN", "BUY", 20);
			// 91,000 * 20 = 1,820,000 TMN -> 18,200,000 IRR
			expect(result.executedSumIrr).toBe(18200000n);
			expect(result.feeIrr).toBe(0n);
		});

		it("can execute the two-step OTC flow (quote then order) sequentially within TTL", async () => {
			const mockFetch = vi.fn().mockImplementation(async (url: string) => {
				if (url.includes("/v1/account/otc/price")) {
					return new Response(
						JSON.stringify({
							result: {
								symbol: "USDTTMN",
								side: "BUY",
								price: "90500",
								ttl: 15,
							},
							success: true,
						}),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					);
				}
				if (url.includes("/v1/account/easy-trade/orders")) {
					return new Response(
						JSON.stringify({
							result: {
								clientOrderId: "wallex-order-seq",
								executedPrice: "90500",
								executedQty: "50",
								executedSum: "4525000",
								fee: "4525",
							},
							success: true,
						}),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					);
				}
				throw new Error(`Unexpected url: ${url}`);
			});

			const client = new WallexHttpClient({ apiKey: dummyApiKey, baseUrl: dummyBaseUrl }, mockFetch);

			// Step 1: price quote
			const quote = await client.getOtcPrice("USDTTMN", "BUY");
			expect(quote.priceIrr).toBe(905000n);

			// Step 2: place order within 15s TTL
			const order = await client.placeOtcOrder("USDTTMN", "BUY", 50);
			expect(order.clientOrderId).toBe("wallex-order-seq");
			expect(order.executedPriceIrr).toBe(905000n);
			expect(order.executedSumIrr).toBe(45250000n);

			expect(mockFetch).toHaveBeenCalledTimes(2);
		});
	});

	describe("Slice 3: Error Mapping & Resilience", () => {
		it("maps HTTP 401 and 403 to WallexAuthError", async () => {
			const mockFetch401 = vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ message: "Invalid API Key" }), {
					status: 401,
					headers: { "Content-Type": "application/json" },
				}),
			);
			const client401 = new WallexHttpClient({ apiKey: dummyApiKey, baseUrl: dummyBaseUrl }, mockFetch401);
			await expect(client401.getOtcPrice("USDTTMN", "BUY")).rejects.toThrow(WallexAuthError);

			const mockFetch403 = vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ error: "Forbidden" }), {
					status: 403,
					headers: { "Content-Type": "application/json" },
				}),
			);
			const client403 = new WallexHttpClient({ apiKey: dummyApiKey, baseUrl: dummyBaseUrl }, mockFetch403);
			await expect(client403.getOtcPrice("USDTTMN", "BUY")).rejects.toThrow(WallexAuthError);
		});

		it("maps HTTP 429 to WallexRateLimitError", async () => {
			const mockFetch = vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ message: "Too Many Requests" }), {
					status: 429,
					headers: { "Content-Type": "application/json" },
				}),
			);
			const client = new WallexHttpClient({ apiKey: dummyApiKey, baseUrl: dummyBaseUrl }, mockFetch);
			await expect(client.getOtcPrice("USDTTMN", "BUY")).rejects.toThrow(WallexRateLimitError);
		});

		it("maps HTTP 503 and maintenance responses to WallexMaintenanceError", async () => {
			const mockFetch503 = vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ message: "Service Unavailable" }), {
					status: 503,
					headers: { "Content-Type": "application/json" },
				}),
			);
			const client503 = new WallexHttpClient({ apiKey: dummyApiKey, baseUrl: dummyBaseUrl }, mockFetch503);
			await expect(client503.getOtcPrice("USDTTMN", "BUY")).rejects.toThrow(WallexMaintenanceError);

			const mockFetchMaint = vi.fn().mockResolvedValue(
				new Response(
					JSON.stringify({
						success: false,
						message: "Exchange is under maintenance",
					}),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					},
				),
			);
			const clientMaint = new WallexHttpClient({ apiKey: dummyApiKey, baseUrl: dummyBaseUrl }, mockFetchMaint);
			await expect(clientMaint.getOtcPrice("USDTTMN", "BUY")).rejects.toThrow(WallexMaintenanceError);
		});

		it("maps network failures to WallexNetworkError", async () => {
			const mockFetch = vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND api.wallex.ir"));
			const client = new WallexHttpClient({ apiKey: dummyApiKey, baseUrl: dummyBaseUrl }, mockFetch);
			await expect(client.getOtcPrice("USDTTMN", "BUY")).rejects.toThrow(WallexNetworkError);
		});

		it("maps malformed JSON or missing price to WallexBadResponseError", async () => {
			const mockFetchBadJson = vi.fn().mockResolvedValue(
				new Response("<html>Bad Gateway</html>", {
					status: 200,
					headers: { "Content-Type": "text/html" },
				}),
			);
			const clientBadJson = new WallexHttpClient({ apiKey: dummyApiKey, baseUrl: dummyBaseUrl }, mockFetchBadJson);
			await expect(clientBadJson.getOtcPrice("USDTTMN", "BUY")).rejects.toThrow(WallexBadResponseError);

			const mockFetchMissingPrice = vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ result: { symbol: "USDTTMN" } }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
			const clientMissingPrice = new WallexHttpClient(
				{ apiKey: dummyApiKey, baseUrl: dummyBaseUrl },
				mockFetchMissingPrice,
			);
			await expect(clientMissingPrice.getOtcPrice("USDTTMN", "BUY")).rejects.toThrow(WallexBadResponseError);
		});

		it("maps other API errors to WallexApiError with status code and body", async () => {
			const mockFetch = vi.fn().mockResolvedValue(
				new Response(
					JSON.stringify({
						message: "Insufficient TMN balance",
						code: "BALANCE_LOW",
					}),
					{
						status: 400,
						headers: { "Content-Type": "application/json" },
					},
				),
			);
			const client = new WallexHttpClient({ apiKey: dummyApiKey, baseUrl: dummyBaseUrl }, mockFetch);
			try {
				await client.placeOtcOrder("USDTTMN", "BUY", 100);
				expect.unreachable("Should have thrown WallexApiError");
			} catch (err) {
				expect(err).toBeInstanceOf(WallexApiError);
				const apiErr = err as WallexApiError;
				expect(apiErr.statusCode).toBe(400);
				expect(apiErr.message).toContain("Insufficient TMN balance");
				expect(apiErr.code).toBe("WALLEX_API_ERROR");
			}
		});
	});

	describe("Slice 4: Configuration & Environment Wiring", () => {
		it("creates WallexConfigVo from env with default baseUrl", () => {
			const config = WallexConfigVo.fromEnv({
				WALLEX_API_KEY: "my-env-api-key",
			});
			expect(config.apiKey).toBe("my-env-api-key");
			expect(config.baseUrl).toBe("https://api.wallex.ir");
		});

		it("creates WallexConfigVo from env with custom baseUrl and trims trailing slash", () => {
			const config = WallexConfigVo.fromEnv({
				WALLEX_API_KEY: "my-env-api-key",
				WALLEX_API_BASE_URL: "https://sandbox.wallex.ir///",
			});
			expect(config.apiKey).toBe("my-env-api-key");
			expect(config.baseUrl).toBe("https://sandbox.wallex.ir");
		});

		it("throws error when WALLEX_API_KEY is missing in env", () => {
			expect(() => WallexConfigVo.fromEnv({})).toThrow("WALLEX_API_KEY environment variable is required");
		});

		it("createWallexClient factory initializes WallexClient successfully", async () => {
			const { createWallexClient } = await import("@/modules/wallex");
			const client = createWallexClient({
				apiKey: "explicit-key",
				baseUrl: "https://api.wallex.ir",
			});
			expect(client).toBeDefined();
			expect(typeof client.getOtcPrice).toBe("function");
			expect(typeof client.placeOtcOrder).toBe("function");
		});
	});
});
