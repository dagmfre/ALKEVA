import { Module } from "@nestjs/common";
import { ChapaModule } from "../chapa/chapa.module.js";
import { PaymentsModule } from "../payments/payments.module.js";
import { PayoutsModule } from "../payouts/payouts.module.js";
import { WebhooksController } from "./webhooks.controller.js";

@Module({
  imports: [ChapaModule, PaymentsModule, PayoutsModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
