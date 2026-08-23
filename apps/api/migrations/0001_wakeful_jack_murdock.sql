ALTER TABLE "images" ADD COLUMN "width" integer;--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "height" integer;--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;