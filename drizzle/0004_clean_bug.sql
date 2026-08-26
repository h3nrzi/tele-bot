CREATE TYPE "public"."ledger_account_type" AS ENUM('BUYER_WALLET', 'SYSTEM_CASH');--> statement-breakpoint
CREATE TYPE "public"."ledger_entry_direction" AS ENUM('DEBIT', 'CREDIT');--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ledger_transaction_id" uuid NOT NULL,
	"account_type" "ledger_account_type" NOT NULL,
	"direction" "ledger_entry_direction" NOT NULL,
	"usd_amount" numeric(18, 2) NOT NULL,
	"wallet_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"top_up_request_id" uuid,
	"narrative" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "top_up_requests_user_id_active_idx";--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_ledger_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("ledger_transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_top_up_request_id_top_up_requests_id_fk" FOREIGN KEY ("top_up_request_id") REFERENCES "public"."top_up_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "top_up_requests_user_id_active_idx" ON "top_up_requests" USING btree ("user_id") WHERE "top_up_requests"."status" IN ('INITIATED', 'PENDING');