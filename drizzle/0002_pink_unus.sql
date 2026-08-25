CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_number" varchar(16) NOT NULL,
	"card_holder_name" varchar NOT NULL,
	"bank_name" varchar NOT NULL,
	"additional_notes" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
