CREATE TYPE "public"."catalog_type" AS ENUM('STATIC_DELIVERY', 'DIRECT_ACCOUNT', 'IDENTITY_HANDLE', 'CONFIG_VPN');--> statement-breakpoint
CREATE TYPE "public"."fulfillment_strategy" AS ENUM('PAYLOAD_DELIVERY', 'ACTIVATION', 'AUTOMATED_PANEL');--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "catalog_type" "catalog_type" DEFAULT 'STATIC_DELIVERY' NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "fulfillment_strategy" "fulfillment_strategy" DEFAULT 'PAYLOAD_DELIVERY' NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "requirement_config" jsonb;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fulfillment_strategy_snapshot" "fulfillment_strategy" DEFAULT 'PAYLOAD_DELIVERY' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "buyer_inputs" jsonb;
