"""
WarClaw — EdgeRunner AI Naval LAN Operating System
FastAPI backend entry point.
"""
import logging
import os
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from .config import (
    APP_NAME, APP_SUBTITLE, APP_VERSION,
    FRONTEND_DIR, GENERATED_APPS_DIR, MODELS_DIR,
    HOST, PORT
)
from .routers import chat, lan, apps, hardware

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("warclaw")

# ── App init ────────────────────────────────────────────────────────────────
app = FastAPI(
    title=APP_NAME,
    description=APP_SUBTITLE,
    version=APP_VERSION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # LAN-only — all ship terminals allowed
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── API routers ──────────────────────────────────────────────────────────────
app.include_router(chat.router)
app.include_router(lan.router)
app.include_router(apps.router)
app.include_router(hardware.router)


# ── Static frontend ──────────────────────────────────────────────────────────
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


@app.get("/", response_class=HTMLResponse)
async def root():
    """Serve the main WarClaw dashboard."""
    index = FRONTEND_DIR / "index.html"
    if index.exists():
        return FileResponse(str(index))
    return HTMLResponse("<h1>WarClaw starting...</h1>")


@app.get("/api/status")
async def status():
    """System health check."""
    from .services.llm import llm_service
    return {
        "system": APP_NAME,
        "version": APP_VERSION,
        "tagline": APP_SUBTITLE,
        "model_ready": llm_service.ready,
        "model_path": llm_service.model_path,
        "generated_apps": len(list(GENERATED_APPS_DIR.glob("*/manifest.json"))),
    }


# ── Startup ──────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def on_startup():
    log.info("=" * 60)
    log.info(" %s v%s", APP_NAME, APP_VERSION)
    log.info(" %s", APP_SUBTITLE)
    log.info("=" * 60)

    # Ensure directories exist
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    GENERATED_APPS_DIR.mkdir(parents=True, exist_ok=True)

    # Auto-load model if WARCLAW_MODEL env var is set
    model_env = os.getenv("WARCLAW_MODEL", "")
    if model_env and Path(model_env).exists():
        from .services.llm import llm_service
        from .services.hardware import detect_hardware
        from .config import DEFAULT_CONTEXT_LENGTH, DEFAULT_THREADS
        hw = detect_hardware()
        log.info("Auto-loading model: %s", model_env)
        try:
            llm_service.load(
                model_path=model_env,
                n_ctx=DEFAULT_CONTEXT_LENGTH,
                n_threads=DEFAULT_THREADS,
                n_gpu_layers=hw.recommended_gpu_layers,
            )
        except Exception as e:
            log.error("Auto-load failed: %s", e)
    else:
        log.info("No model auto-loaded. Use /api/hardware/models/load to load a GGUF model.")
        log.info("Place .gguf files in: %s", MODELS_DIR)

    log.info("WarClaw ready at http://%s:%d", HOST, PORT)
