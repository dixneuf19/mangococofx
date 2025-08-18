.PHONY: dev admin

# Démarrage en dev
dev:
	uv run uvicorn server:app --reload --port 5173

# Ouvre l'admin (imprime l'URL)
admin:
	@echo "Admin: http://localhost:5173/admin"
