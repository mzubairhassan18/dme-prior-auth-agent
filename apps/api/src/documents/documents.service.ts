import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { CacheService } from '../cache/cache.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

const ALLOWED_TYPES = new Map<string, string[]>([
  ['application/pdf', ['.pdf']],
  ['image/png', ['.png']],
  ['image/jpeg', ['.jpg', '.jpeg']],
]);

const documentSelect = {
  id: true,
  orderId: true,
  fileName: true,
  contentType: true,
  size: true,
  createdAt: true,
} as const;

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly cache: CacheService,
  ) {}

  async upload(orderId: string, file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Multipart field "file" is required');
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      throw new BadRequestException('File must be 5 MB or smaller');
    }

    const extension = extname(file.originalname).toLowerCase();
    const allowedExtensions = ALLOWED_TYPES.get(file.mimetype);
    if (!allowedExtensions || !allowedExtensions.includes(extension)) {
      throw new BadRequestException('Only PDF, PNG, or JPEG files are allowed');
    }

    await this.ensureOrder(orderId);

    const storageKey = `orders/${orderId}/${randomUUID()}${extension}`;
    try {
      await this.storage.put(storageKey, file.buffer, file.mimetype);
    } catch {
      throw new ServiceUnavailableException('Clinical document storage is unavailable');
    }

    try {
      const document = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.clinicalDocument.create({
          data: {
            orderId,
            fileName: file.originalname,
            contentType: file.mimetype,
            size: file.size,
            storageKey,
          },
          select: documentSelect,
        });

        await transaction.auditLog.create({
          data: {
            entityType: 'dme_order',
            entityId: orderId,
            action: 'document_uploaded',
            actor: 'api',
            detail: {
              documentId: created.id,
              fileName: created.fileName,
              contentType: created.contentType,
              size: created.size,
            },
          },
        });

        return created;
      });

      await this.cache.invalidateOrders(orderId);
      return document;
    } catch (error) {
      // Never leave an orphaned object when metadata persistence fails.
      await this.storage.remove(storageKey);
      throw error;
    }
  }

  async list(orderId: string) {
    await this.ensureOrder(orderId);

    return this.prisma.clinicalDocument.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
      select: documentSelect,
    });
  }

  async presignedUrl(orderId: string, documentId: string): Promise<string> {
    const document = await this.prisma.clinicalDocument.findFirst({
      where: { id: documentId, orderId },
      select: { storageKey: true },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    return this.storage.presignedDownload(document.storageKey);
  }

  private async ensureOrder(orderId: string): Promise<void> {
    const order = await this.prisma.dmeOrder.findUnique({
      where: { id: orderId },
      select: { id: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }
  }
}
