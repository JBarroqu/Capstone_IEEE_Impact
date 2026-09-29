CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"client_ts" timestamp with time zone,
	"session_id" uuid NOT NULL,
	"wish_id" uuid,
	"participant_code" text NOT NULL,
	"app_version" text NOT NULL,
	"provider" text,
	"name" text NOT NULL,
	"step" integer,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_moves" (
	"id" text NOT NULL,
	"session_id" uuid NOT NULL,
	"wish_id" uuid,
	"step" integer NOT NULL,
	"move" jsonb NOT NULL,
	"provider" text NOT NULL,
	"model" text,
	"prompt_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generated_moves_id_session_id_pk" PRIMARY KEY("id","session_id")
);
--> statement-breakpoint
CREATE TABLE "llm_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"moves" jsonb NOT NULL,
	"provider" text NOT NULL,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"participant_code" text NOT NULL,
	"provider" text,
	"app_version" text,
	"consented" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wishes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"text" text NOT NULL,
	"from_chip" boolean DEFAULT false NOT NULL,
	"type" text,
	"focus" jsonb,
	"domains" jsonb,
	"guessed_focus" jsonb,
	"guessed_domains" jsonb,
	"archetype" text,
	"why" text,
	"prior_attempts" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "events_session_idx" ON "events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "events_name_idx" ON "events" USING btree ("name");