import { Module } from "@nestjs/common";
import { ChapaService } from "./chapa.service.js";

/** No controller — the client is injected by payments, payouts, and admin. */
@Module({
  providers: [ChapaService],
  exports: [ChapaService],
})
export class ChapaModule {}
