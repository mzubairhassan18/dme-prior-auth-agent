import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { join } from 'node:path';

export interface AgentCitation {
  documentSlug: string;
  documentTitle: string;
  section: string;
  score: number;
}

export interface AgentExtraction {
  equipment: { code: string; description: string; quantity: number };
  diagnosis: { code: string; description: string };
  clinicalSummary: string;
  supportingEvidence: string[];
  missingInformation: string[];
  urgency: string;
  confidence: number;
}

export interface AnalyzeOrderReply {
  orderId: string;
  outcome: 'APPROVE' | 'NEEDS_MORE_INFO' | 'DENY';
  rationale: string;
  policyReference: string;
  missingDocuments: string[];
  confidence: number;
  citations: AgentCitation[];
  extraction: AgentExtraction;
  model: string;
  latencyMs: number;
}

interface PriorAuthClient extends grpc.Client {
  analyzeOrder(
    request: { orderId: string },
    options: grpc.CallOptions,
    callback: (error: grpc.ServiceError | null, response?: AnalyzeOrderReply) => void,
  ): grpc.ClientUnaryCall;
}

type PriorAuthClientConstructor = new (
  address: string,
  credentials: grpc.ChannelCredentials,
) => PriorAuthClient;

interface AgentProto {
  dme: {
    agent: {
      v1: {
        PriorAuthAgent: PriorAuthClientConstructor;
      };
    };
  };
}

/** Thin gRPC client for the Python prior-authorization service. */
@Injectable()
export class AgentClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentClientService.name);
  private client?: PriorAuthClient;
  private address = 'localhost:50051';

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const protoPath =
      this.config.get<string>('AGENT_PROTO_PATH') ??
      join(process.cwd(), '..', '..', 'proto', 'agent.proto');
    this.address = this.config.get<string>('AGENT_GRPC_URL') ?? 'localhost:50051';

    const definition = protoLoader.loadSync(protoPath, {
      keepCase: false,
      longs: Number,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const proto = grpc.loadPackageDefinition(definition) as unknown as AgentProto;
    const Client = proto.dme.agent.v1.PriorAuthAgent;

    this.client = new Client(this.address, grpc.credentials.createInsecure());
    this.logger.log(`gRPC client ready → ${this.address}`);
  }

  onModuleDestroy(): void {
    this.client?.close();
  }

  async analyze(orderId: string): Promise<AnalyzeOrderReply> {
    const client = this.client;
    if (!client) {
      throw new Error('gRPC client not initialized');
    }

    return new Promise<AnalyzeOrderReply>((resolve, reject) => {
      client.analyzeOrder({ orderId }, { deadline: Date.now() + 180_000 }, (error, response) => {
        if (error) {
          reject(error);
          return;
        }
        if (!response) {
          reject(new Error('Agent returned an empty gRPC response'));
          return;
        }
        resolve(response);
      });
    });
  }
}
