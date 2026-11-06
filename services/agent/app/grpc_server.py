"""gRPC server exposing the prior-authorization workflow.

Run from `services/agent`:

    .venv/Scripts/python.exe -m app.grpc_server
"""

import asyncio
import logging
import uuid

import grpc

from .bootstrap import build_runtime
from .config import Settings, get_settings
from .grpc_generated import agent_pb2, agent_pb2_grpc
from .llm import ProviderError
from .rag import RetrievalError
from .repository import OrderNotFoundError, RepositoryError
from .workflow import AnalysisResult, AnalysisService, WorkflowError

logger = logging.getLogger("agent.grpc")


def to_proto_response(
    order_id: str, result: AnalysisResult, model: str
) -> agent_pb2.AnalyzeOrderResponse:
    """Map the workflow result onto the protobuf contract."""
    extraction = result.extraction
    decision = result.decision

    return agent_pb2.AnalyzeOrderResponse(
        order_id=order_id,
        outcome=decision.outcome,
        rationale=decision.rationale,
        policy_reference=decision.policy_reference,
        missing_documents=decision.missing_documents,
        confidence=decision.confidence,
        citations=[
            agent_pb2.PolicyCitation(
                document_slug=chunk.document_slug,
                document_title=chunk.document_title,
                section=chunk.section or "",
                score=chunk.score,
            )
            for chunk in result.citations
        ],
        extraction=agent_pb2.ClinicalExtraction(
            equipment=agent_pb2.Equipment(
                code=extraction.equipment.code,
                description=extraction.equipment.description,
                quantity=extraction.equipment.quantity,
            ),
            diagnosis=agent_pb2.Diagnosis(
                code=extraction.diagnosis.code,
                description=extraction.diagnosis.description,
            ),
            clinical_summary=extraction.clinical_summary,
            supporting_evidence=extraction.supporting_evidence,
            missing_information=extraction.missing_information,
            urgency=extraction.urgency,
            confidence=extraction.confidence,
        ),
        model=model,
        latency_ms=result.latency_ms,
    )


class PriorAuthAgentServicer(agent_pb2_grpc.PriorAuthAgentServicer):
    def __init__(self, analysis: AnalysisService, model_name: str) -> None:
        self._analysis = analysis
        self._model_name = model_name

    async def AnalyzeOrder(self, request, context):  # noqa: N802 — gRPC method name
        try:
            order_id = str(uuid.UUID(request.order_id))
        except ValueError:
            await context.abort(
                grpc.StatusCode.INVALID_ARGUMENT, "order_id must be a UUID"
            )

        try:
            result = await self._analysis.analyze(order_id)
        except OrderNotFoundError:
            await context.abort(grpc.StatusCode.NOT_FOUND, "Order not found")
        except (RepositoryError, RetrievalError) as exc:
            await context.abort(grpc.StatusCode.UNAVAILABLE, str(exc))
        except (ProviderError, WorkflowError) as exc:
            await context.abort(grpc.StatusCode.INTERNAL, str(exc))

        return to_proto_response(order_id, result, self._model_name)


async def serve(settings: Settings | None = None) -> None:
    settings = settings or get_settings()
    runtime = build_runtime(settings)

    server = grpc.aio.server()
    agent_pb2_grpc.add_PriorAuthAgentServicer_to_server(
        PriorAuthAgentServicer(runtime.analysis, settings.ollama_chat_model),
        server,
    )
    address = f"{settings.grpc_host}:{settings.grpc_port}"
    server.add_insecure_port(address)

    await server.start()
    logger.info("gRPC server listening on %s", address)

    try:
        await server.wait_for_termination()
    finally:
        await server.stop(grace=5)
        await runtime.aclose()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    try:
        asyncio.run(serve())
    except KeyboardInterrupt:
        logger.info("gRPC server stopped")
