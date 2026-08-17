import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { GoogleGenAI } from "@google/genai";
import type { Env, KycExtractionDto } from "@alkeva/shared";
import { ENV } from "../core/core.module.js";
import { toApiError } from "./gemini-errors.js";

/**
 * Mime types we will hand to the model. Deliberately narrower than the KYC
 * upload allowlist: a PDF is accepted as a document and stored, it just isn't
 * read here. Extraction is a convenience, so an unreadable format degrades to
 * "no extraction" rather than failing the upload.
 */
const READABLE = new Set(["image/jpeg", "image/png", "image/webp"]);

/** The model must answer in this shape or not at all. */
const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    fullName: {
      type: ["string", "null"],
      description: "Full name exactly as printed on the document, in Latin script if present.",
    },
    docNumber: {
      type: ["string", "null"],
      description: "The document/ID number exactly as printed, including any letters.",
    },
    expiry: {
      type: ["string", "null"],
      description: "Expiry date exactly as printed on the document. Do not reformat it.",
    },
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
      description: "How legible the document was.",
    },
  },
  required: ["fullName", "docNumber", "expiry", "confidence"],
} as const;

const INSTRUCTION = [
  "You read identity documents and transcribe three fields. You are a transcription tool, not a verifier.",
  "",
  "Rules:",
  "- Transcribe ONLY what is printed on the document. Never guess, complete, or correct a value.",
  "- If a field is absent, unreadable, or you are not certain of it, return null for that field. A null is always better than a plausible guess: a person will read this and a wrong value is worse than a blank one.",
  "- Do not reformat dates, names, or numbers. Copy them character for character as printed.",
  "- Never state whether the document is genuine, valid, expired, or acceptable. That judgement is not yours to make.",
  "- If the image is not an identity document at all, return null for all three fields with confidence 'low'.",
].join("\n");

/**
 * Reads an uploaded identity document so the user can confirm the fields
 * instead of typing them, and so the reviewing officer can see what the
 * document says beside what the user declared.
 *
 * What it is not: a check that the document is real. It cannot verify a
 * hologram, a chip, or a registry, and it never claims to — approval stays a
 * human decision through the existing KYC review path. A mismatch it surfaces
 * is a prompt to look, nothing more.
 */
@Injectable()
export class VisionService {
  private client: GoogleGenAI | null = null;

  constructor(@Inject(ENV) private readonly env: Env) {}

  get configured(): boolean {
    return this.env.GEMINI_API_KEY.length > 0;
  }

  /** True when this file type can be read at all — PDFs are stored, not read. */
  static readable(mime: string): boolean {
    return READABLE.has(mime);
  }

  /**
   * Returns the transcription, or null when the document could not be read.
   * Never throws for a bad document; only an unconfigured key is an error the
   * caller should surface.
   */
  async extractIdFields(file: Buffer, mime: string): Promise<KycExtractionDto | null> {
    if (!this.configured) throw new ServiceUnavailableException("ai_unconfigured");
    if (!VisionService.readable(mime)) return null;
    this.client ??= new GoogleGenAI({ apiKey: this.env.GEMINI_API_KEY });

    let interaction: unknown;
    try {
      interaction = await this.client.interactions.create({
        model: this.env.GEMINI_MODEL,
        store: false,
        system_instruction: INSTRUCTION,
        input: [
          {
            type: "user_input",
            content: [
              { type: "image", data: file.toString("base64"), mime_type: mime },
              { type: "text", text: "Transcribe the three fields from this document." },
            ],
          },
        ],
        response_format: { type: "text", mime_type: "application/json", schema: EXTRACTION_SCHEMA },
      } as never);
    } catch (err) {
      // The provider's own wording (quota URLs, project ids) never reaches the
      // caller — it is our operational problem, not the user's.
      throw toApiError(err, "kyc document extraction");
    }

    const raw = (interaction as { output_text?: string | null }).output_text ?? "";
    return parseExtraction(raw);
  }
}

/**
 * The model is schema-constrained, but a malformed or surprising payload must
 * degrade to "no extraction" rather than write junk into a KYC record.
 */
function parseExtraction(raw: string): KycExtractionDto | null {
  if (!raw.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const o = parsed as Record<string, unknown>;

  const field = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const trimmed = v.trim();
    // Models sometimes answer the literal word rather than a null.
    if (!trimmed || /^(null|n\/a|unknown|not visible)$/i.test(trimmed)) return null;
    return trimmed.slice(0, 200);
  };

  const confidence =
    o.confidence === "high" || o.confidence === "medium" || o.confidence === "low"
      ? o.confidence
      : "low";

  const out: KycExtractionDto = {
    fullName: field(o.fullName),
    docNumber: field(o.docNumber),
    expiry: field(o.expiry),
    confidence,
  };
  // Nothing legible read: report no extraction rather than an empty shell that
  // would render as three confident blanks beside the user's typed values.
  if (!out.fullName && !out.docNumber && !out.expiry) return null;
  return out;
}
