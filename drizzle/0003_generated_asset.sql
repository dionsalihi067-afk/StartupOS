CREATE TABLE "generated_asset" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"business_id" text NOT NULL,
	"kind" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generated_asset_kind_check" CHECK ("generated_asset"."kind" in ('logo', 'icon')),
	CONSTRAINT "generated_asset_content_type_check" CHECK ("generated_asset"."content_type" = 'image/png')
);
--> statement-breakpoint
ALTER TABLE "generated_asset" ADD CONSTRAINT "generated_asset_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_asset" ADD CONSTRAINT "generated_asset_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generated_asset_business_idx" ON "generated_asset" USING btree ("business_id");