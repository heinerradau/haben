CREATE TABLE "business_area_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"voucher_id" uuid NOT NULL,
	"area_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_area_assignments_voucher_id_unique" UNIQUE("voucher_id")
);
--> statement-breakpoint
CREATE TABLE "business_area_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"area_id" uuid NOT NULL,
	"richtung" text,
	"feld" text NOT NULL,
	"muster" text NOT NULL,
	"rang" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"zweig" text NOT NULL,
	"sortierung" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_areas_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "business_area_assignments" ADD CONSTRAINT "business_area_assignments_voucher_id_lexoffice_vouchers_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "public"."lexoffice_vouchers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_area_assignments" ADD CONSTRAINT "business_area_assignments_area_id_business_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."business_areas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_area_rules" ADD CONSTRAINT "business_area_rules_area_id_business_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."business_areas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "business_area_rules_area" ON "business_area_rules" USING btree ("area_id");