from __future__ import annotations

import asyncio
from typing import Set

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="Mango Coco Production Backend")

# Very small in-memory pubsub of websocket clients
class Hub:
    def __init__(self) -> None:
        self._clients: Set[WebSocket] = set()
        self._lock = asyncio.Lock()
        self.state = {"overlays": {}}  # e.g., {"chicken": true}

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._clients.add(ws)
        # Send current state on connect
        await ws.send_json({"type": "state", "payload": self.state})

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(ws)

    async def broadcast(self, message: dict) -> None:
        stale: list[WebSocket] = []
        for ws in list(self._clients):
            try:
                await ws.send_json(message)
            except Exception:
                stale.append(ws)
        for ws in stale:
            await self.disconnect(ws)

hub = Hub()

@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await hub.connect(ws)
    try:
        while True:
            # We don't expect messages from clients yet; keep alive
            await ws.receive_text()
    except WebSocketDisconnect:
        await hub.disconnect(ws)
    except Exception:
        await hub.disconnect(ws)

@app.post("/api/overlay/{name}")
async def set_overlay(name: str, request: Request):
    data = await request.json()
    enabled = bool(data.get("on", False))
    hub.state.setdefault("overlays", {})[name] = enabled
    await hub.broadcast({"type": "overlay", "payload": {"name": name, "on": enabled}})
    return JSONResponse({"ok": True, "name": name, "on": enabled})

# Serve static files (frontend) from repo root
app.mount("/static", StaticFiles(directory=".", html=False), name="static")

@app.get("/")
async def index():
    return FileResponse("index.html")

@app.get("/admin")
async def admin():
    return FileResponse("admin.html")
