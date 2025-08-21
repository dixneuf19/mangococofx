from __future__ import annotations

import asyncio
from typing import Set

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="Mango Coco Production Backend")

# Set caching headers: cache static assets, avoid caching HTML and APIs
@app.middleware("http")
async def add_cache_headers(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path

    if request.method in ("GET", "HEAD"):
        # Cache static assets on CDN and browsers for 5 minutes
        if path.startswith("/static/"):
            cache_seconds = 300
            cache_value = f"public, max-age={cache_seconds}, s-maxage={cache_seconds}"
            response.headers["Cache-Control"] = cache_value
            # Helpful for CDNs when compression varies
            response.headers.setdefault("Vary", "Accept-Encoding")
        # Do not cache HTML pages
        elif path in ("/", "/admin") or path.endswith(".html"):
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        # APIs should not be cached by default
        elif path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"

    return response

# Very small in-memory pubsub of websocket clients
class Hub:
    def __init__(self) -> None:
        # Shared state, single active overlay name or None, plus flags map
        self.state: dict = {"active": None, "overlays": {}}
        # Version increments whenever state changes
        self.version: int = 0
        # Event to wake long-poll waiters
        self.changed: asyncio.Event = asyncio.Event()
        self._lock = asyncio.Lock()

    async def set_overlay(self, name: str, enabled: bool) -> None:
        async with self._lock:
            overlays: dict = self.state.setdefault("overlays", {})
            if enabled:
                # Exclusif: active = name, tous les autres à False
                for k in list(overlays.keys()):
                    overlays[k] = (k == name)
                overlays[name] = True
                self.state["active"] = name
            else:
                overlays[name] = False
                if self.state.get("active") == name:
                    self.state["active"] = None
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
