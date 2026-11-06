import { Module } from '@nestjs/common';
import { OrdersGateway } from './orders.gateway.js';
import { RealtimeEventsConsumer } from './realtime-events.consumer.js';

@Module({
  providers: [OrdersGateway, RealtimeEventsConsumer],
  exports: [OrdersGateway],
})
export class RealtimeModule {}
