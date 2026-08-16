-- Multi-language support: user.locale stops being a Postgres enum.
--
-- The product now ships Amharic, English, Tigrinya, Afaan Oromoo and Somali,
-- and intends to keep adding Ethiopian languages. A pgEnum makes every new
-- language a schema migration, and `ALTER TYPE … ADD VALUE` cannot be used in
-- the same transaction that then writes the value — which is exactly what a
-- migrate-then-seed deploy does. Text plus boundary validation (zod against
-- LOCALES in @alkeva/shared) makes the next language a translation file only.
--
-- No CHECK constraint on purpose: the constraint would reintroduce the very
-- per-language migration this removes. Nothing writes this column except the
-- validated register/preference endpoints.

ALTER TABLE "user" ALTER COLUMN "locale" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "locale" TYPE text USING "locale"::text;
--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "locale" SET DEFAULT 'am';
--> statement-breakpoint
DROP TYPE IF EXISTS "locale";
