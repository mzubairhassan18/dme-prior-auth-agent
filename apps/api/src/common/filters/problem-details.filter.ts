import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ProblemPayload {
  title?: string;
  detail?: string;
  message?: string | string[];
  errors?: Array<{ path: string; message: string }>;
}

function titleForStatus(status: number): string {
  const name = HttpStatus[status] as string | undefined;
  if (!name) return 'Error';
  return name
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/**
 * Global exception filter — every error leaves the API as RFC 7807
 * `application/problem+json`, regardless of which service threw it.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let title = 'Internal Server Error';
    let detail: string | undefined;
    let errors: ProblemPayload['errors'];

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      title = titleForStatus(status);

      const body = exception.getResponse();
      if (typeof body === 'string') {
        title = body;
      } else if (body && typeof body === 'object') {
        const payload = body as ProblemPayload;
        const message = Array.isArray(payload.message)
          ? payload.message.join(', ')
          : payload.message;
        title = payload.title ?? message ?? title;
        detail = payload.detail;
        errors = payload.errors;
      }
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    response
      .status(status)
      .type('application/problem+json')
      .json({
        type: 'about:blank',
        title,
        status,
        ...(detail ? { detail } : {}),
        instance: request.url,
        ...(errors ? { errors } : {}),
      });
  }
}
