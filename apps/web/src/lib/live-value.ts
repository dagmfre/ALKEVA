import type { HoldingDto } from "@alkeva/shared";

import type { LivePrice } from "@/components/market/price-provider";

/**
 * Client-side mark-to-market against the shared live price.
 *
 * The server stays authoritative for cost basis, gain/loss *methodology* and
 * tier; the client only re-marks current value with the same tick every other
 * surface shows, so Portfolio ≡ Home total ≡ ticker at every instant. Same
 * integer math as the API: gramsMg × etbCentsPerGram / 1000, floored.
 */
export function markToMarket(gramsMg: string, etbCentsPerGram: string): bigint {
  return (BigInt(etbCentsPerGram) * BigInt(gramsMg)) / 1000n;
}

/** A holding revalued at the live tick — falls back to the server's own mark when the store is empty. */
export function revalueHolding(h: HoldingDto, price: LivePrice | null): HoldingDto {
  if (!price) return h;
  const valueCents = markToMarket(h.gramsMg, price.etbCentsPerGram);
  const cost = BigInt(h.costBasisCents);
  const gainLoss = valueCents - cost;
  return {
    ...h,
    valueCents: valueCents.toString(),
    gainLossCents: gainLoss.toString(),
    gainLossPctMilli: cost > 0n ? ((gainLoss * 100_000n) / cost).toString() : null,
    unitEtbCentsPerGram: price.etbCentsPerGram,
    priceAt: price.at,
  };
}
