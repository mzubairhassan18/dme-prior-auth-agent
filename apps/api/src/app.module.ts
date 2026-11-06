import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentModule } from './agent/agent.module.js';
import { validateEnv } from './config/env.js';
import { EventsModule } from './events/events.module.js';
import { HealthModule } from './health/health.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { PatientsModule } from './patients/patients.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    EventsModule,
    HealthModule,
    PatientsModule,
    OrdersModule,
    AgentModule,
    RealtimeModule,
  ],
})
export class AppModule {}
