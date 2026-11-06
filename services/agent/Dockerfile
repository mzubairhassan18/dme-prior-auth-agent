# syntax=docker/dockerfile:1

FROM python:3.13-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DEFAULT_TIMEOUT=60 \
    PIP_RETRIES=10

WORKDIR /app

COPY services/agent/requirements.txt ./requirements.txt
RUN --mount=type=cache,id=dme-pip-cache,target=/root/.cache/pip \
    pip install --retries 10 --timeout 60 -r requirements.txt

COPY services/agent/ ./

EXPOSE 8000 50051

# Compose overrides the command for the gRPC server and RabbitMQ consumer.
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
