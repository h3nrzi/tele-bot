CREATE TYPE "public"."rate_mode" AS ENUM('MANUAL', 'AUTO_SYNC');--> statement-breakpoint
CREATE TABLE "exchange_rate_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" "rate_mode" DEFAULT 'MANUAL' NOT NULL,
	"spread_percent" numeric(5, 2) DEFAULT '0.00' NOT NULL,
	"sync_interval_minutes" integer DEFAULT 60 NOT NULL,
	"updated_by_admin_telegram_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_rate_config_spread_check" CHECK ("spread_percent" >= 0 AND "spread_percent" <= 10)
);--> statement-breakpoint
INSERT INTO "exchange_rate_config" ("mode", "spread_percent", "sync_interval_minutes")
SELECT 'MANUAL', 0.00, 60
WHERE NOT EXISTS (SELECT 1 FROM "exchange_rate_config");--> statement-breakpoint
ALTER TABLE "top_up_requests" ALTER COLUMN "exchange_rate_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "top_up_requests" ADD COLUMN "locked_irr_per_usd" bigint;--> statement-breakpoint
ALTER TABLE "top_up_requests" ADD COLUMN "rate_source" varchar(50);--> statement-breakpoint
UPDATE "top_up_requests"
SET "locked_irr_per_usd" = "exchange_rates"."irr_per_usd",
    "rate_source" = 'MANUAL'
FROM "exchange_rates"
WHERE "top_up_requests"."exchange_rate_id" = "exchange_rates"."id";--> statement-breakpoint
ALTER TABLE "top_up_requests" ALTER COLUMN "locked_irr_per_usd" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "top_up_requests" ALTER COLUMN "rate_source" SET NOT NULL;--> statement-breakpoint
CREATE TYPE "public"."otc_purchase_status" AS ENUM('PENDING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TABLE "wallex_otc_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"top_up_request_id" uuid NOT NULL,
	"usdt_quantity" numeric(18, 2) NOT NULL,
	"status" "otc_purchase_status" NOT NULL,
	"wallex_client_order_id" varchar(255),
	"wallex_executed_price" bigint,
	"wallex_executed_qty" numeric(18, 8),
	"wallex_executed_sum" bigint,
	"wallex_fee" bigint,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "wallex_otc_purchases" ADD CONSTRAINT "wallex_otc_purchases_top_up_request_id_top_up_requests_id_fk" FOREIGN KEY ("top_up_request_id") REFERENCES "public"."top_up_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wallex_otc_purchases_top_up_request_id_active_idx" ON "wallex_otc_purchases" USING btree ("top_up_request_id") WHERE "wallex_otc_purchases"."status" IN ('PENDING', 'COMPLETED');
