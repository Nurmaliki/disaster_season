CREATE TABLE "disaster_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"category" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"occurred_at" timestamp with time zone,
	"valid_from" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"latitude" real,
	"longitude" real,
	"province" text,
	"regency" text,
	"source_name" text NOT NULL,
	"source_id" text,
	"source_priority" integer,
	"payload" jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "disaster_events_occurred_at_idx" ON "disaster_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "disaster_events_type_idx" ON "disaster_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "disaster_events_category_idx" ON "disaster_events" USING btree ("category");--> statement-breakpoint
CREATE INDEX "disaster_events_severity_idx" ON "disaster_events" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "disaster_events_province_idx" ON "disaster_events" USING btree ("province");--> statement-breakpoint
CREATE INDEX "disaster_events_source_name_idx" ON "disaster_events" USING btree ("source_name");--> statement-breakpoint
CREATE INDEX "disaster_events_updated_at_idx" ON "disaster_events" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "disaster_events_source_identity_idx" ON "disaster_events" USING btree ("source_name","source_id");