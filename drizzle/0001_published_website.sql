CREATE TABLE "published_website" (
	"business_id" text PRIMARY KEY NOT NULL,
	"public_slug" text NOT NULL,
	"status" text NOT NULL,
	"fingerprint" text NOT NULL,
	"site" jsonb NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "published_website_status_check" CHECK ("published_website"."status" in ('live', 'unpublished'))
);
--> statement-breakpoint
ALTER TABLE "published_website" ADD CONSTRAINT "published_website_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "published_website_slug_uidx" ON "published_website" USING btree ("public_slug");--> statement-breakpoint
CREATE INDEX "published_website_status_idx" ON "published_website" USING btree ("status");
