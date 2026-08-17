-- KYC document reading (the honest form of "scan the document").
--
-- Two sets of columns, deliberately separate. `declared_*` is what the USER
-- typed and submitted — their claim about themselves, and the only thing they
-- are answerable for. `extracted_*` is what a model read off the image, which
-- is a transcription and nothing more: it does not verify a hologram, a chip,
-- or any registry, and it never approves anything.
--
-- Keeping them apart is the point. A reviewer sees both and the disagreement
-- between them, which is a reason to look closer — not a verdict. If the two
-- were merged into one field the reviewer would lose exactly the signal that
-- makes the extraction worth having.
--
-- All of them are text, including expiry: an OCR pass returns whatever is
-- printed, and coercing "12 SEP 2029" into a date column would either fail the
-- upload or silently invent a value.

ALTER TABLE "kyc_submission" ADD COLUMN "declared_full_name" text;
--> statement-breakpoint
ALTER TABLE "kyc_submission" ADD COLUMN "declared_doc_number" text;
--> statement-breakpoint
ALTER TABLE "kyc_submission" ADD COLUMN "declared_expiry" text;
--> statement-breakpoint
ALTER TABLE "kyc_submission" ADD COLUMN "extracted_full_name" text;
--> statement-breakpoint
ALTER TABLE "kyc_submission" ADD COLUMN "extracted_doc_number" text;
--> statement-breakpoint
ALTER TABLE "kyc_submission" ADD COLUMN "extracted_expiry" text;
--> statement-breakpoint
ALTER TABLE "kyc_submission" ADD COLUMN "extracted_confidence" text;
--> statement-breakpoint
ALTER TABLE "kyc_submission" ADD COLUMN "extracted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "kyc_submission" ADD COLUMN "extraction_model" text;
