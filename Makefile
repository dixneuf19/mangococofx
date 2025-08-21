.PHONY: dev admin format check-format

# Démarrage en dev
dev:
	uv run uvicorn server:app --reload --port 5173

# Ouvre l'admin (imprime l'URL)
admin:
	@echo "Admin: http://localhost:5173/admin"

fmt:
	uv run isort .
	uv run ruff format
	uv run ruff check --fix

check-fmt:
	uv run isort --check .
	uv run ruff format --check .
	uv run ruff check .
	uv run ty check
