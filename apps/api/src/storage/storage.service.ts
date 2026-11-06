import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';

/** S3-compatible object storage (MinIO) for clinical documents. */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: Client;
  private readonly publicClient: Client;
  readonly bucket: string;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('MINIO_BUCKET') ?? 'dme-clinical-documents';

    const port = config.get<number>('MINIO_PORT') ?? 9000;
    const useSSL = config.get<boolean>('MINIO_USE_SSL') ?? false;
    const accessKey = config.get<string>('MINIO_ACCESS_KEY') ?? 'dme';
    const secretKey = config.get<string>('MINIO_SECRET_KEY') ?? 'dme-local-secret';
    const endpoint = config.get<string>('MINIO_ENDPOINT') ?? 'localhost';
    const publicEndpoint = config.get<string>('MINIO_PUBLIC_ENDPOINT') ?? endpoint;

    // Server-side operations use the internal service name; presigned URLs must
    // be signed against the hostname the browser can resolve.
    // Pin the region so the SDK does not perform a bucket-location lookup
    // against the browser-facing endpoint when presigning. The API container
    // cannot resolve/reach the host's `localhost` endpoint.
    this.client = new Client({
      endPoint: endpoint,
      port,
      useSSL,
      accessKey,
      secretKey,
      region: 'us-east-1',
    });
    this.publicClient = new Client({
      endPoint: publicEndpoint,
      port,
      useSSL,
      accessKey,
      secretKey,
      region: 'us-east-1',
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureBucket();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`object storage unavailable — uploads will fail: ${message}`);
    }
  }

  private async ensureBucket(): Promise<void> {
    if (await this.client.bucketExists(this.bucket)) {
      this.logger.log(`bucket ${this.bucket} ready`);
      return;
    }

    await this.client.makeBucket(this.bucket, 'us-east-1');
    this.logger.log(`created bucket ${this.bucket}`);
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.putObject(this.bucket, key, body, body.length, {
      'Content-Type': contentType,
    });
  }

  presignedDownload(key: string, expiresSeconds = 900): Promise<string> {
    return this.publicClient.presignedGetObject(this.bucket, key, expiresSeconds);
  }

  async remove(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key).catch(() => undefined);
  }
}
