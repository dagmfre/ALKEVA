import { createHmac, timingSafeEqual } from "node:crypto";
import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Redis } from "ioredis";
import type { Env } from "@alkeva/shared";
import { ENV, REDIS } from "../core/core.module.js";

/**
 * The only code that talks to api.chapa.co. Endpoints and payload shapes are
 * verified against developer.chapa.co (docs/chapa/* + live fetches 11 Aug 2026)
 * — never guessed, per working rule 1.
 *
 * Every Chapa response is the envelope { message, status, data }.
 */
interface ChapaEnvelope<T> {
  message: string;
  status: "success" | "failed" | null;
  data: T | null;
}

export interface ChapaVerifyData {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  currency: string;
  /** Decimal ETB (e.g. 100 or 100.5) — convert with etbToCents(). */
  amount: number;
  /** Chapa's fee — a merchant cost; the user is credited the full amount. */
  charge: number;
  mode: "test" | "live";
  method: string | null;
  type: string;
  status: "success" | "failed" | "pending";
  reference: string;
  tx_ref: string;
  created_at: string;
  updated_at: string;
}

export interface ChapaTransferVerifyData {
  account_name: string | null;
  account_number: string;
  amount: number;
  currency: string;
  charge: number;
  mode?: "test" | "live";
  transfer_method?: string;
  bank_code: number;
  bank_name: string;
  status: string;
  reference: string | null;
  chapa_transfer_id?: string;
  created_at: string;
  updated_at: string;
}

export interface ChapaBank {
  id: number;
  name: string;
  slug?: string;
  swift?: string;
  acct_length?: number;
  currency?: string;
  is_mobilemoney?: number | boolean | null;
}

export interface ChapaBalance {
  currency: string;
  available_balance: number;
  ledger_balance: number;
}

/** A failed Chapa envelope, preserving their human message for audit trails. */
export class ChapaApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
  ) {
    super(message);
  }
}

const BANKS_CACHE_KEY = "chapa:banks";
const BANKS_CACHE_SECONDS = 3600;

/** Chapa amounts are decimal ETB; the ledger is integer cents. Round-trip exactly. */
export function centsToEtbString(cents: bigint): string {
  const whole = cents / 100n;
  const frac = (cents % 100n).toString().padStart(2, "0");
  return `${whole}.${frac}`;
}

export function etbToCents(amount: number): bigint {
  // Chapa returns JSON numbers; ETB has exactly 2 decimals, so ×100 with a
  // round kills float noise (e.g. 100.1 * 100 === 10009.999…).
  return BigInt(Math.round(amount * 100));
}

@Injectable()
export class ChapaService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  get configured(): boolean {
    return this.env.CHAPA_SECRET_KEY.length > 0;
  }

  /** Test keys are prefixed CHASECK_TEST — drives sandbox-only behaviour. */
  get testMode(): boolean {
    return this.env.CHAPA_SECRET_KEY.startsWith("CHASECK_TEST");
  }

  assertConfigured(): void {
    if (!this.configured) {
      throw new ServiceUnavailableException("payments_unconfigured");
    }
  }

  /**
   * POST /v1/transaction/initialize → hosted checkout URL.
   * tx_ref is ours and unique; the webhook + verify path keys off it.
   */
  async initializeTransaction(input: {
    txRef: string;
    amountCents: bigint;
    email: string;
    fullName: string;
    returnUrl: string;
  }): Promise<{ checkoutUrl: string }> {
    const [firstName, ...rest] = input.fullName.trim().split(/\s+/);
    const data = await this.request<{ checkout_url: string }>(
      "/v1/transaction/initialize",
      {
        method: "POST",
        body: {
          amount: centsToEtbString(input.amountCents),
          currency: "ETB",
          email: input.email,
          first_name: firstName ?? "",
          last_name: rest.join(" ") || undefined,
          tx_ref: input.txRef,
          return_url: input.returnUrl,
          "customization[title]": "ALKEVA deposit",
        },
      },
    );
    if (!data?.checkout_url) {
      throw new ChapaApiError("initialize returned no checkout_url", 502);
    }
    return { checkoutUrl: data.checkout_url };
  }

  /**
   * GET /v1/transaction/verify/<tx_ref> — the authoritative payment state.
   * Returns null for "not found / not paid yet" (Chapa 404s those) so callers
   * can poll without treating pending as an error.
   */
  async verifyTransaction(txRef: string): Promise<ChapaVerifyData | null> {
    try {
      return await this.request<ChapaVerifyData>(
        `/v1/transaction/verify/${encodeURIComponent(txRef)}`,
        { method: "GET" },
      );
    } catch (err) {
      if (err instanceof ChapaApiError && err.httpStatus === 404) return null;
      throw err;
    }
  }

  /**
   * POST /v1/transfers — queue a payout. In test mode the optional `status`
   * field forces the outcome deterministically (verified: developer.chapa.co
   * /transfer/transfers), which is what makes the demo repeatable.
   */
  async transfer(input: {
    reference: string;
    amountCents: bigint;
    bankCode: number;
    accountNumber: string;
    accountName: string;
    /** Test mode only — forces the sandbox outcome. */
    forceStatus?: "success" | "failed" | "pending";
  }): Promise<{ data: string | null; message: string }> {
    const body: Record<string, unknown> = {
      amount: centsToEtbString(input.amountCents),
      currency: "ETB",
      reference: input.reference,
      bank_code: input.bankCode,
      account_number: input.accountNumber,
      account_name: input.accountName,
    };
    if (this.testMode && input.forceStatus) body.status = input.forceStatus;

    const raw = await this.requestRaw<string>("/v1/transfers", { method: "POST", body });
    return { data: raw.data, message: raw.message };
  }

  /** GET /v1/transfers/verify/<reference> — null when Chapa doesn't know it. */
  async verifyTransfer(reference: string): Promise<ChapaTransferVerifyData | null> {
    try {
      return await this.request<ChapaTransferVerifyData>(
        `/v1/transfers/verify/${encodeURIComponent(reference)}`,
        { method: "GET" },
      );
    } catch (err) {
      if (err instanceof ChapaApiError && err.httpStatus === 404) return null;
      throw err;
    }
  }

  /**
   * GET /v1/banks — destination codes for the withdrawal form. Redis-cached:
   * the list changes rarely and the form loads often. This live call is also
   * Phase 4.5's answer to "what are the wallet bank_codes actually?".
   */
  async banks(): Promise<ChapaBank[]> {
    const cached = await this.redis.get(BANKS_CACHE_KEY);
    if (cached) return JSON.parse(cached) as ChapaBank[];
    const data = (await this.request<ChapaBank[]>("/v1/banks", { method: "GET" })) ?? [];
    await this.redis.set(BANKS_CACHE_KEY, JSON.stringify(data), "EX", BANKS_CACHE_SECONDS);
    return data;
  }

  /** GET /v1/balances — merchant float, for the admin treasury panel. */
  async balances(): Promise<ChapaBalance[]> {
    return (await this.request<ChapaBalance[]>("/v1/balances", { method: "GET" })) ?? [];
  }

  /**
   * Webhook origin check (docs: either header validating is sufficient).
   *   chapa-signature   = HMAC-SHA256(secret, secret)
   *   x-chapa-signature = HMAC-SHA256(secret, raw payload bytes)
   * The docs are internally ambiguous about which secret signs (dashboard
   * "secret hash" vs API secret key), so both are tried — every candidate is
   * still an HMAC under a secret only we and Chapa hold, so accepting any
   * match loses nothing. Which one the sandbox actually uses gets recorded
   * during self-verification.
   */
  verifyWebhookSignature(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer | undefined,
  ): boolean {
    const secrets = [this.env.CHAPA_WEBHOOK_HASH, this.env.CHAPA_SECRET_KEY].filter(
      (s) => s.length > 0,
    );
    if (secrets.length === 0 || !rawBody) return false;

    const provided = [headers["chapa-signature"], headers["x-chapa-signature"]]
      .flat()
      .filter((v): v is string => typeof v === "string" && v.length > 0);
    if (provided.length === 0) return false;

    const expected: string[] = [];
    for (const secret of secrets) {
      expected.push(createHmac("sha256", secret).update(secret).digest("hex"));
      expected.push(createHmac("sha256", secret).update(rawBody).digest("hex"));
    }
    return provided.some((sig) => expected.some((exp) => safeEqual(sig, exp)));
  }

  // ── internals ───────────────────────────────────────────────────

  private async request<T>(
    path: string,
    init: { method: "GET" | "POST"; body?: Record<string, unknown> },
  ): Promise<T | null> {
    const raw = await this.requestRaw<T>(path, init);
    return raw.data;
  }

  private async requestRaw<T>(
    path: string,
    init: { method: "GET" | "POST"; body?: Record<string, unknown> },
  ): Promise<ChapaEnvelope<T>> {
    this.assertConfigured();
    const res = await fetch(`${this.env.CHAPA_API_BASE}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${this.env.CHAPA_SECRET_KEY}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });

    let envelope: ChapaEnvelope<T>;
    try {
      envelope = (await res.json()) as ChapaEnvelope<T>;
    } catch {
      throw new ChapaApiError(`non-JSON response (HTTP ${res.status})`, res.status);
    }
    if (!res.ok || envelope.status === "failed") {
      throw new ChapaApiError(envelope.message ?? `HTTP ${res.status}`, res.status);
    }
    return envelope;
  }
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
