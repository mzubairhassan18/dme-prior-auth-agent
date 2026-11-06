import {
  BadGatewayException,
  BadRequestException,
  Controller,
  GatewayTimeoutException,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  ServiceUnavailableException,
  type HttpException,
} from '@nestjs/common';
import * as grpc from '@grpc/grpc-js';
import { AgentClientService, type AnalyzeOrderReply } from './agent-client.service.js';

function toHttpException(error: unknown): HttpException {
  if (error instanceof Error && 'code' in error) {
    const { code, message } = error as grpc.ServiceError;

    switch (code) {
      case grpc.status.NOT_FOUND:
        return new NotFoundException(message || 'Order not found');
      case grpc.status.INVALID_ARGUMENT:
        return new BadRequestException(message || 'Invalid order id');
      case grpc.status.DEADLINE_EXCEEDED:
        return new GatewayTimeoutException('Agent analysis timed out');
      case grpc.status.UNAVAILABLE:
        return new ServiceUnavailableException('Agent service unavailable');
      default:
        return new BadGatewayException('Agent analysis failed');
    }
  }

  return new BadGatewayException('Agent analysis failed');
}

@Controller('orders')
export class AgentController {
  constructor(private readonly agent: AgentClientService) {}

  /** REST façade over the gRPC AnalyzeOrder call. */
  @Post(':id/analyze-grpc')
  @HttpCode(200)
  async analyzeViaGrpc(@Param('id') id: string): Promise<AnalyzeOrderReply> {
    try {
      return await this.agent.analyze(id);
    } catch (error) {
      throw toHttpException(error);
    }
  }
}
