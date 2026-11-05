import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Validates a request part (body/query/param) against a Zod schema.
 * Errors are thrown as BadRequestException and shaped to RFC 7807 by
 * ProblemDetailsFilter.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        title: 'Validation failed',
        errors: result.error.issues.map((issue) => ({
          path: issue.path.map(String).join('.') || '(root)',
          message: issue.message,
        })),
      });
    }
    return result.data;
  }
}
