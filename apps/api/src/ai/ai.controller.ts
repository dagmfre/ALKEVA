import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  aiChatDto,
  type AiChatDto,
  type AiChatResponse,
  type AiConversationResponse,
  type AiConversationsResponse,
} from "@alkeva/shared";
import { Auth, AuthGuard } from "../auth/auth.guard.js";
import type { AccessPayload } from "../auth/auth.service.js";
import { ZodPipe } from "../core/zod.pipe.js";
import { AiService } from "./ai.service.js";

@Controller("ai")
export class AiController {
  constructor(private readonly ai: AiService) {}

  /** Tight throttle: the demo runs on the Gemini free tier (~10 RPM). */
  @Post("chat")
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  chat(
    @Auth() auth: AccessPayload,
    @Body(new ZodPipe(aiChatDto)) dto: AiChatDto,
  ): Promise<AiChatResponse> {
    return this.ai.chat(auth.sub, dto.message, dto.conversationId);
  }

  /** Legacy single-thread endpoint — the latest thread. Kept for old clients. */
  @Get("conversation")
  @UseGuards(AuthGuard)
  conversation(@Auth() auth: AccessPayload): Promise<AiConversationResponse> {
    return this.ai.latestConversation(auth.sub);
  }

  @Get("conversations")
  @UseGuards(AuthGuard)
  conversations(@Auth() auth: AccessPayload): Promise<AiConversationsResponse> {
    return this.ai.listConversations(auth.sub);
  }

  @Get("conversations/:id")
  @UseGuards(AuthGuard)
  conversationById(
    @Auth() auth: AccessPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<AiConversationResponse> {
    return this.ai.conversationById(auth.sub, id);
  }

  @Delete("conversations/:id")
  @UseGuards(AuthGuard)
  deleteConversation(
    @Auth() auth: AccessPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<{ ok: true }> {
    return this.ai.deleteConversation(auth.sub, id);
  }
}
