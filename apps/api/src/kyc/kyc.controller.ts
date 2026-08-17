import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import { KYC_DOC_TYPES, type KycExtractionDto, type KycMeResponse } from "@alkeva/shared";
import { Auth, AuthGuard } from "../auth/auth.guard.js";
import type { AccessPayload } from "../auth/auth.service.js";
import { KycService } from "./kyc.service.js";

@Controller("kyc")
export class KycController {
  constructor(private readonly kyc: KycService) {}

  @Get("me")
  @UseGuards(AuthGuard)
  me(@Auth() auth: AccessPayload): Promise<KycMeResponse> {
    return this.kyc.me(auth.sub);
  }

  /** multipart/form-data: `file` (image/pdf, ≤2 MB) + `docType`. */
  @Post()
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 2 * 1024 * 1024, files: 1 } }),
  )
  submit(
    @Auth() auth: AccessPayload,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body("docType") docType: string,
    @Body("fullName") fullName?: string,
    @Body("docNumber") docNumber?: string,
    @Body("expiry") expiry?: string,
  ): Promise<KycMeResponse> {
    if (!file) throw new BadRequestException("file_required");
    const parsedDocType = KYC_DOC_TYPES.find((t) => t === docType);
    if (!parsedDocType) throw new BadRequestException("invalid_doc_type");
    return this.kyc.submit(auth.sub, parsedDocType, file, {
      fullName,
      docNumber,
      expiry,
    });
  }

  /**
   * Read a document without storing it, so the user can confirm the fields
   * before they submit. Same size/type limits and the same throttle as the
   * real upload — this endpoint costs a model call, so it cannot be cheaper
   * to abuse than the thing it previews.
   */
  @Post("extract")
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 2 * 1024 * 1024, files: 1 } }),
  )
  extract(
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<{ extraction: KycExtractionDto | null }> {
    if (!file) throw new BadRequestException("file_required");
    return this.kyc.preview(file);
  }
}
