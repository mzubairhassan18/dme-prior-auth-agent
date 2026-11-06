from dataclasses import dataclass

from .config import Settings
from .llm import OllamaProvider
from .publisher import EventPublisher
from .rag import PolicyRetriever
from .repository import OrderRepository
from .workflow import AnalysisService, build_workflow


@dataclass
class AgentRuntime:
    """Shared object graph for the HTTP API, gRPC server, and RabbitMQ worker."""

    provider: OllamaProvider
    publisher: EventPublisher
    analysis: AnalysisService

    async def aclose(self) -> None:
        await self.publisher.aclose()
        await self.provider.aclose()


def build_runtime(settings: Settings) -> AgentRuntime:
    provider = OllamaProvider(settings)
    publisher = EventPublisher(settings)
    retriever = PolicyRetriever(settings, provider)
    repository = OrderRepository(settings)
    graph = build_workflow(
        provider,
        retriever,
        repository,
        model_name=settings.ollama_chat_model,
        publisher=publisher,
    )

    return AgentRuntime(
        provider=provider,
        publisher=publisher,
        analysis=AnalysisService(graph, repository, publisher=publisher),
    )
