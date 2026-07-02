"""FastAPI app: WebSocket hub + static frontend serving.

Phase 0: a single WS endpoint that says hello on connect and answers ping with
pong. Static files are the built Vite bundle in web/dist (served when present),
so the same server backs both `nlpilot-ide` desktop and browser modes.
"""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path

from fastapi import Body, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

from .controller import DebugController
from .project import Project, ProjectError
from .ws_protocol import Cmd, Evt, Message

logger = logging.getLogger("nlpilot_ide")

# web/dist relative to repo root (this file: nlpilot_ide/server/app.py)
_WEB_DIST = Path(__file__).resolve().parents[2] / "web" / "dist"


def create_app(root: str | Path | None = None) -> FastAPI:
    app = FastAPI(title="nlpilot-ide", version="0.1.0")
    root = root or os.environ.get("NLPILOT_IDE_ROOT") or Path.cwd()
    project = Project(root)

    @app.get("/api/health")
    async def health() -> JSONResponse:
        return JSONResponse({"ok": True, "web_dist": _WEB_DIST.exists()})

    # ---- project / file API ----
    @app.get("/api/root")
    async def get_root() -> JSONResponse:
        return JSONResponse({"root": str(project.root)})

    @app.post("/api/root")
    async def set_root(path: str = Body(..., embed=True)) -> JSONResponse:
        try:
            project.set_root(path)
        except ProjectError as e:
            raise HTTPException(status_code=400, detail=str(e))
        return JSONResponse({"root": str(project.root)})

    @app.get("/api/tree")
    async def get_tree() -> JSONResponse:
        return JSONResponse(project.tree().to_dict())

    @app.get("/api/file")
    async def get_file(path: str) -> JSONResponse:
        try:
            return JSONResponse({"path": path, "content": project.read(path)})
        except ProjectError as e:
            raise HTTPException(status_code=400, detail=str(e))

    @app.put("/api/file")
    async def put_file(
        path: str = Body(...), content: str = Body(...)
    ) -> JSONResponse:
        try:
            project.write(path, content)
        except ProjectError as e:
            raise HTTPException(status_code=400, detail=str(e))
        return JSONResponse({"ok": True, "path": path})

    @app.websocket("/ws")
    async def ws_endpoint(ws: WebSocket) -> None:
        await ws.accept()
        await ws.send_json(Message(Evt.HELLO, {"version": "0.1.0"}).to_dict())
        controller = DebugController(project)

        async def pump() -> None:
            # Drain engine events and forward them to the client.
            while True:
                for m in controller.poll():
                    await ws.send_json(m)
                await asyncio.sleep(0.03)

        pump_task = asyncio.create_task(pump())
        try:
            while True:
                raw = await ws.receive_json()
                msg = Message.from_dict(raw)
                # Generate is slow (LLM) — run off the event loop.
                if msg.type == Cmd.NLT_GENERATE:
                    try:
                        blocks = await asyncio.to_thread(
                            controller.generate_blocks, msg.payload.get("path", "")
                        )
                        await ws.send_json(
                            Message(Evt.NLT_GENERATED, {"blocks": blocks}).to_dict()
                        )
                    except Exception as e:  # noqa: BLE001
                        await ws.send_json(
                            Message(Evt.ERROR, {"reason": f"generate failed: {e}"}).to_dict()
                        )
                    continue
                reply = controller.handle(msg)
                if reply is not None:
                    await ws.send_json(reply.to_dict())
        except WebSocketDisconnect:
            logger.info("ws client disconnected")
        finally:
            pump_task.cancel()
            controller._stop()

    # Mount the built frontend last so /ws and /api win. Only if built.
    if _WEB_DIST.exists():
        app.mount("/", StaticFiles(directory=str(_WEB_DIST), html=True), name="web")
    else:
        @app.get("/")
        async def _no_build() -> JSONResponse:
            return JSONResponse(
                {"error": "frontend not built", "hint": "cd web && npm install && npm run build"},
                status_code=503,
            )

    return app


app = create_app()
