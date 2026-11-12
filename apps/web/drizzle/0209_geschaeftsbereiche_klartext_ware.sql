CREATE TABLE "business_contact_names" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"muster" text NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_stock_items" ADD COLUMN "ladenpreis_cent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "business_stock_items" ADD COLUMN "verkauft" integer DEFAULT 0 NOT NULL;