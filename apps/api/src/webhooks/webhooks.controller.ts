import {
  Controller,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
  type RawBodyRequest,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request } from "express";
import { ChapaService } from "../chapa/chapa.service.js";
import { PaymentsService } from "../payments/payments.service.js";
import { PayoutsService } from "../payouts/payouts.service.js";

/**
 * Chapa's event listener. Public by necessity (Chapa calls it), guarded by
 * the HMAC signature headers instead of a session. Throttling is skipped:
 * Chapa retries every 10 minutes for up to 72 hours until it sees a 200,
 * and rate-limiting a retrying webhook would starve legitimate settles.
 *
 * The handler never credits from the payload alone — it dispatches to the
 * services' verify-then-settle paths, which re-query Chapa's API for the
 * authoritative state. A forged-but-signed payload can therefore trigger a
 * check, never a credit.
 */
@Controller("webhooks")
export class WebhooksController {
  constructor(
    private readonly chapa: ChapaService,
    private readonly payments: PaymentsService,
    private readonly payouts: PayoutsService,
  ) {}

  @Post("chapa")
  @HttpCode(200)
  @SkipThrottle()
  async chapaEvent(@Req() req: RawBodyRequest<Request>): Promise<{ received: boolean }> {
    if (!this.chapa.verifyWebhookSignature(req.headers, req.rawBody)) {
      throw new UnauthorizedException("invalid_signature");
    }

    const event = req.body as Record<string, unknown>;
    const eventName = typeof event.event === "string" ? event.event : "";
    const isPayout =
      event.type === "Payout" || eventName.startsWith("payout.") || eventName.startsWith("transfer.");

    try {
      if (isPayout) {
        const reference = typeof event.reference === "string" ? event.reference : "";
        if (reference) await this.payouts.handleTransferEvent(reference, eventName);
      } else {
        const txRef = typeof event.tx_ref === "string" ? event.tx_ref : "";
        if (txRef) await this.payments.handleChargeEvent(txRef, eventName, event);
      }
    } catch (err) {
      // Still 200: the event is recorded/known; retrying won't fix an internal
      // error, and the reconcile path covers any missed settle. Log loudly.
      console.error(`chapa webhook processing failed (${eventName}):`, err);
    }
    return { received: true };
  }
}
