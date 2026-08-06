import { BadRequestException, Injectable, type PipeTransform } from "@nestjs/common";
import type { ZodSchema } from "zod";

/** Per-route request validation using the shared zod DTOs. */
@Injectable()
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: "validation_failed",
        issues: result.error.issues.map((i) => ({
          path: i.path.join("."),
          code: i.code,
          message: i.message,
        })),
      });
    }
    return result.data;
  }
}
