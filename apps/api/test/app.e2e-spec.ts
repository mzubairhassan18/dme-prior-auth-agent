import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { ProblemDetailsFilter } from './../src/common/filters/problem-details.filter.js';

const UNKNOWN_ORDER_ID = '00000000-0000-4000-8000-000000000000';
const UNKNOWN_DOCUMENT_ID = '11111111-1111-4111-8111-111111111111';

describe('API (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health — 200 with db up', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(response.body).toMatchObject({ status: 'ok', db: 'up' });
  });

  it('GET /api/v1/orders — 200 list', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/orders').expect(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it('POST /api/v1/orders with invalid body — 400 problem+json', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .send({ patientId: 'not-a-uuid' })
      .expect(400);

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body.title).toBe('Validation failed');
    expect(response.body.errors.length).toBeGreaterThan(0);
  });

  it('GET an unknown order — 404 problem+json', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/orders/${UNKNOWN_ORDER_ID}`)
      .expect(404);

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body.title).toBe('Order not found');
  });

  it('GET a malformed order id — 400 problem+json', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/orders/not-a-uuid')
      .expect(400);

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body.title).toBe('Validation failed');
  });

  it('POST a document without a file — 400 problem+json', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/orders/${UNKNOWN_ORDER_ID}/documents`)
      .expect(400);

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body.title).toContain('file');
  });

  it('POST a document with an unsupported type — 400', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/orders/${UNKNOWN_ORDER_ID}/documents`)
      .attach('file', Buffer.from('not a clinical document'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      })
      .expect(400);

    expect(response.body.title).toContain('Only PDF, PNG, or JPEG');
  });

  it('POST a PDF for an unknown order — 404 before object storage', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/orders/${UNKNOWN_ORDER_ID}/documents`)
      .attach('file', Buffer.from('%PDF-1.4 test'), {
        filename: 'clinical-note.pdf',
        contentType: 'application/pdf',
      })
      .expect(404);

    expect(response.body.title).toBe('Order not found');
  });

  it('GET a presigned URL for an unknown document — 404', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/orders/${UNKNOWN_ORDER_ID}/documents/${UNKNOWN_DOCUMENT_ID}/url`)
      .expect(404);

    expect(response.body.title).toBe('Document not found');
  });
});
