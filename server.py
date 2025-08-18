from __future__ import annotations

import asyncio
from typing import Set

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="Mango Coco Production Backend")

# Very small in-memory pubsub of websocket clients
class Hub:
    def __init__(self) -> None:
        # Shared state, e.g., {"overlays": {"chicken": True}}
        self.state: dict = {"overlays": {}}
        # Version increments whenever state changes
        self.version: int = 0
        # Event to wake long-poll waiters
        self.changed: asyncio.Event = asyncio.Event()
        self._lock = asyncio.Lock()

    async def set_overlay(self, name: str, enabled: bool) -> None:
        async with self._lock:
            self.state.setdefault("overlays", {})[name] = enabled
            self.version += 1
            # Wake any pollers
            self.changed.set()

hub = Hub()

@app.post("/api/overlay/{name}")
async def set_overlay(name: str, request: Request):
    data = await request.json()
    enabled = bool(data.get("on", False))
    await hub.set_overlay(name, enabled)
    return JSONResponse({"ok": True, "name": name, "on": enabled, "version": hub.version})

@app.get("/api/poll")
async def poll(since: int = -1, timeout_ms: int = 25000):
    # If client's version is behind, return immediately
    if since < hub.version:
        return JSONResponse({"version": hub.version, "state": hub.state})
    # Otherwise, wait for a change or timeout
    try:
        await asyncio.wait_for(hub.changed.wait(), timeout=timeout_ms / 1000.0)
    except asyncio.TimeoutError:
        pass
    # Clear the event so subsequent waits block again
    if hub.changed.is_set():
        hub.changed.clear()
    return JSONResponse({"version": hub.version, "state": hub.state})

# Serve static files (frontend) from repo root
app.mount("/static", StaticFiles(directory="static", html=False), name="static")

@app.get("/")
async def index():
    return FileResponse("static/index.html")

@app.get("/admin")
async def admin():
    return FileResponse("static/admin.html")
