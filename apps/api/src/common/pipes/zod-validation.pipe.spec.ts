import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe.js';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(z.object({ name: z.string().min(2) }));

  it('returns parsed data for valid input', () => {
    expect(pipe.transform({ name: 'ok' }, { type: 'body' })).toEqual({ name: 'ok' });
  });

  it('throws BadRequestException with problem-detail errors for invalid input', () => {
    try {
      pipe.transform({ name: 'x' }, { type: 'body' });
      expect.unreachable('pipe should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);

      const response = (error as BadRequestException).getResponse() as {
        title: string;
        errors: Array<{ path: string; message: string }>;
      };

      expect(response.title).toBe('Validation failed');
      expect(response.errors[0]?.path).toBe('name');
      expect(response.errors[0]?.message).toBeTruthy();
    }
  });
});
