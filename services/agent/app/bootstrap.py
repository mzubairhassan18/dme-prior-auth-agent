from dataclasses import dataclass

from .config import Settings
from .llm import OllamaProvider
from .rag import PolicyRetriever
from .repository import OrderRepository
from .workflow import AnalysisService, build_workflow


@dataclass
class AgentRuntime:
    """Shared object graph for the HTTP API and the RabbitMQ worker."""

    provider: OllamaProvider
    analysis: AnalysisService

    async def aclose(self) -> None:
        await self.provider.aclose()


def build_runtime(settings: Settings) -> AgentRuntime:
    provider = OllamaProvider(settings)
    retriever = PolicyRetriever(settings, provider)
    repository = OrderRepository(settings)
    graph = build_workflow(
        provider,
        retriever,
        repository,
        model_name=settings.ollama_chat_model,
    )

    return AgentRuntime(
        provider=provider,
        analysis=AnalysisService(graph, repository),
    )
