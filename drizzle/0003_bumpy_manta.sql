CREATE TYPE "public"."top_up_status" AS ENUM('INITIATED', 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "top_up_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"exchange_rate_id" uuid NOT NULL,
	"usd_amount" numeric(18, 2) NOT NULL,
	"irr_amount" bigint NOT NULL,
	"status" "top_up_status" NOT NULL,
	"receipt_file_id" varchar,
	"receipt_caption" text,
	"rejection_reason" text,
	"expires_at" timestamp with time zone NOT NULL,
	"processed_by_admin_telegram_id" bigint,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "top_up_requests" ADD CONSTRAINT "top_up_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "top_up_requests" ADD CONSTRAINT "top_up_requests_exchange_rate_id_exchange_rates_id_fk" FOREIGN KEY ("exchange_rate_id") REFERENCES "public"."exchange_rates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "top_up_requests_user_id_active_idx" ON "top_up_requests" USING btree ("user_id") WHERE "top_up_requests"."status" IN ('INITIATED', 'PENDING');