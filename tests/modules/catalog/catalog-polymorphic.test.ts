import "reflect-metadata";
import { describe, it, expect, beforeEach } from "vitest";
import { setupTestDatabase } from "@tests/helpers/test-db";
import { CatalogItem } from "@/modules/catalog/catalog.entity";
import { CatalogService } from "@/modules/catalog/catalog.service";
import { DrizzleCatalogRepository } from "@/modules/catalog/catalog.repository";

describe("Polymorphic Catalog Data Model", () => {
	const { db, container } = setupTestDatabase();
	let catalogService: CatalogService;
	let catalogRepo: DrizzleCatalogRepository;

	beforeEach(() => {
		catalogService = container.resolve(CatalogService);
		catalogRepo = container.resolve(DrizzleCatalogRepository);
	});

	describe("CatalogItem Entity", () => {
		it("assigns default values for polymorphic fields when not specified", () => {
			const item = new CatalogItem({
				id: "00000000-0000-0000-0000-000000000001",
				name: "Standard Static Item",
				description: "Standard description",
				usdPrice: "10.00",
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			expect(item.catalogType).toBe("STATIC_DELIVERY");
			expect(item.fulfillmentStrategy).toBe("PAYLOAD_DELIVERY");
			expect(item.requirementConfig).toBeNull();
		});

		it("accepts and exposes custom polymorphic fields", () => {
			const item = new CatalogItem({
				id: "00000000-0000-0000-0000-000000000002",
				name: "Direct Account Upgrade",
				description: "ChatGPT Plus",
				usdPrice: "20.00",
				isActive: true,
				catalogType: "DIRECT_ACCOUNT",
				fulfillmentStrategy: "ACTIVATION",
				requirementConfig: { authProvider: "openai" },
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			expect(item.catalogType).toBe("DIRECT_ACCOUNT");
			expect(item.fulfillmentStrategy).toBe("ACTIVATION");
			expect(item.requirementConfig).toEqual({ authProvider: "openai" });
		});
	});

	describe("Repository and Service Persistence", () => {
		it("persists and retrieves items with custom catalogType and fulfillmentStrategy", async () => {
			const created = await catalogService.createCatalogItem({
				name: "ChatGPT Plus 1 Month",
				description: "Requires email and password",
				usdPrice: "22.00",
				catalogType: "DIRECT_ACCOUNT",
				fulfillmentStrategy: "ACTIVATION",
			});

			expect(created.catalogType).toBe("DIRECT_ACCOUNT");
			expect(created.fulfillmentStrategy).toBe("ACTIVATION");
			expect(created.requirementConfig).toBeNull();

			// Read via repository
			const retrieved = await catalogRepo.findById(created.id);
			expect(retrieved).not.toBeNull();
			expect(retrieved?.catalogType).toBe("DIRECT_ACCOUNT");
			expect(retrieved?.fulfillmentStrategy).toBe("ACTIVATION");
			expect(retrieved?.requirementConfig).toBeNull();
		});

		it("persists and retrieves requirementConfig JSONB properly", async () => {
			const vpnConfig = {
				allowedRegions: ["de", "nl", "fi"],
				protocols: ["vless", "shadowsocks"],
			};

			const created = await catalogService.createCatalogItem({
				name: "VPN Fast Tunnel",
				description: "High speed proxy",
				usdPrice: "5.00",
				catalogType: "CONFIG_VPN",
				fulfillmentStrategy: "PAYLOAD_DELIVERY",
				requirementConfig: vpnConfig,
			});

			expect(created.catalogType).toBe("CONFIG_VPN");
			expect(created.fulfillmentStrategy).toBe("PAYLOAD_DELIVERY");
			expect(created.requirementConfig).toEqual(vpnConfig);

			const retrieved = await catalogRepo.findById(created.id);
			expect(retrieved?.requirementConfig).toEqual(vpnConfig);
		});

		it("updates polymorphic fields via editCatalogItem", async () => {
			const created = await catalogService.createCatalogItem({
				name: "VPN Tunnel",
				usdPrice: "8.00",
				catalogType: "CONFIG_VPN",
				fulfillmentStrategy: "PAYLOAD_DELIVERY",
			});

			expect(created.fulfillmentStrategy).toBe("PAYLOAD_DELIVERY");

			// Admin upgrades strategy to AUTOMATED_PANEL
			const updated = await catalogService.editCatalogItem(created.id, {
				fulfillmentStrategy: "AUTOMATED_PANEL",
				requirementConfig: { panelId: "marzban-1" },
			});

			expect(updated.fulfillmentStrategy).toBe("AUTOMATED_PANEL");
			expect(updated.requirementConfig).toEqual({ panelId: "marzban-1" });

			const fresh = await catalogRepo.findById(created.id);
			expect(fresh?.fulfillmentStrategy).toBe("AUTOMATED_PANEL");
			expect(fresh?.requirementConfig).toEqual({ panelId: "marzban-1" });
		});

		it("ensures backward compatibility: default values when polymorphic arguments are omitted", async () => {
			const created = await catalogService.createCatalogItem({
				name: "Legacy Static Voucher",
				usdPrice: "15.00",
			});

			expect(created.catalogType).toBe("STATIC_DELIVERY");
			expect(created.fulfillmentStrategy).toBe("PAYLOAD_DELIVERY");
			expect(created.requirementConfig).toBeNull();

			const retrieved = await catalogRepo.findById(created.id);
			expect(retrieved?.catalogType).toBe("STATIC_DELIVERY");
			expect(retrieved?.fulfillmentStrategy).toBe("PAYLOAD_DELIVERY");
			expect(retrieved?.requirementConfig).toBeNull();
		});
	});
});
