# syntax=docker/dockerfile:1.6

FROM ghcr.io/astral-sh/uv:python3.13-trixie AS app

WORKDIR /app

# Install project dependencies using uv
COPY pyproject.toml uv.lock* ./
RUN uv sync --frozen --no-install-project

# Copy application code
COPY . .
# Sync app dependencies (including project itself if needed)
RUN uv sync --frozen

ENV PORT=8080
EXPOSE 8080

# Run the FastAPI app (binds to PORT env)
CMD ["sh", "-c", "uv run uvicorn server:app --host 0.0.0.0 --port ${PORT:-8080}"]
