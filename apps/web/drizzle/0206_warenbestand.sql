CREATE TABLE "business_stock_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"stueck" integer NOT NULL,
	"einkauf_cent" integer NOT NULL,
	"preis_cent" integer NOT NULL,
	"sortierung" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_stock_items_name_unique" UNIQUE("name")
);
