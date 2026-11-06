import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DocumentsService, MAX_DOCUMENT_BYTES } from './documents.service.js';

@Controller('orders/:orderId/documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_DOCUMENT_BYTES },
    }),
  )
  upload(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.documents.upload(orderId, file);
  }

  @Get()
  list(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.documents.list(orderId);
  }

  @Get(':documentId/url')
  async downloadUrl(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return { url: await this.documents.presignedUrl(orderId, documentId) };
  }
}
