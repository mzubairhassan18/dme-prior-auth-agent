import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  CreateOrderSchema,
  OrderQuerySchema,
  type CreateOrderInput,
  type OrderQuery,
} from '@dme/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  findAll(@Query(new ZodValidationPipe(OrderQuerySchema)) query: OrderQuery) {
    return this.orders.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', new ZodValidationPipe(z.uuid())) id: string) {
    return this.orders.findOne(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(CreateOrderSchema)) input: CreateOrderInput) {
    return this.orders.create(input);
  }
}
