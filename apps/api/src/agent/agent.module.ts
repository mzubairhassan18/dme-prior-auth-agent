import { Module } from '@nestjs/common';
import { AgentClientService } from './agent-client.service.js';
import { AgentController } from './agent.controller.js';

@Module({
  controllers: [AgentController],
  providers: [AgentClientService],
  exports: [AgentClientService],
})
export class AgentModule {}
