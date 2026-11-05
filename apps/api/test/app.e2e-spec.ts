import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { ProblemDetailsFilter } from './../src/common/filters/problem-details.filter.js';

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

  it('GET /api/v1/health → 200 with db up', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(response.body).toMatchObject({ status: 'ok', db: 'up' });
  });

  it('GET /api/v1/orders → 200 list', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/orders').expect(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it('POST /api/v1/orders with invalid body → 400 problem+json', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .send({ patientId: 'not-a-uuid' })
      .expect(400);

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body.title).toBe('Validation failed');
    expect(response.body.errors.length).toBeGreaterThan(0);
  });
});
