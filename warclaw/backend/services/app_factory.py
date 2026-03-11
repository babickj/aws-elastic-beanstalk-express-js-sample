"""
App Factory — AI generates full-stack apps and registers them as live routes.

Generated apps consist of:
  - A Python FastAPI router (backend.py)
  - An HTML/JS/CSS frontend (index.html)
  - Metadata (manifest.json)

Apps are stored under generated_apps/<app_slug>/ and auto-mounted.
"""
import asyncio
import importlib.util
import json
import logging
import re
import sys
import time
from pathlib import Path
from typing import Optional

from ..config import GENERATED_APPS_DIR
from .llm import llm_service

log = logging.getLogger("warclaw.factory")

APP_GENERATION_PROMPT = """You are creating a full-stack naval ship application.

Generate EXACTLY two artifacts separated by markers:

===BACKEND===
A complete Python FastAPI router in a single file. It must:
- Define a router = APIRouter() with prefix "/apps/{slug}"
- Include all necessary imports
- Be fully functional and self-contained
- Use only stdlib + fastapi + pydantic (no extra installs)
- For NMEA/MODBUS data, connect to the provided host:port if given

===FRONTEND===
A single complete HTML file with embedded CSS and JS. It must:
- Be a self-contained SPA that talks to /apps/{slug}/api/*
- Have a dark naval-themed UI (dark blues, greens, amber indicators)
- Include the EdgeRunner AI / WarClaw branding footer
- Use fetch() for API calls, no external CDN dependencies

The app name is: {app_name}
The app description is: {description}
Integration context: {context}

Output ONLY the two artifacts with the ===BACKEND=== and ===FRONTEND=== markers. No explanation.
"""


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug[:40]


def _extract_artifacts(response: str) -> tuple[Optional[str], Optional[str]]:
    """Split AI response into backend and frontend code."""
    backend_match = re.search(r"===BACKEND===\s*(.*?)(?====FRONTEND===|$)", response, re.DOTALL)
    frontend_match = re.search(r"===FRONTEND===\s*(.*?)$", response, re.DOTALL)

    backend = backend_match.group(1).strip() if backend_match else None
    frontend = frontend_match.group(1).strip() if frontend_match else None

    # Strip markdown code fences if present
    for code_block in (backend, frontend):
        pass

    def strip_fences(code: Optional[str]) -> Optional[str]:
        if not code:
            return code
        code = re.sub(r"^```[a-z]*\n?", "", code.strip())
        code = re.sub(r"\n?```$", "", code.strip())
        return code.strip()

    return strip_fences(backend), strip_fences(frontend)


async def generate_app(app_name: str, description: str, context: str = "") -> dict:
    """
    Ask the LLM to generate a full-stack app and save it to disk.
    Returns metadata dict with slug, paths, and status.
    """
    slug = _slugify(app_name)
    app_dir = GENERATED_APPS_DIR / slug
    app_dir.mkdir(parents=True, exist_ok=True)

    prompt = APP_GENERATION_PROMPT.format(
        app_name=app_name,
        description=description,
        context=context or "No specific integration context provided.",
        slug=slug,
    )

    log.info("Generating app '%s' (slug: %s)", app_name, slug)
    t0 = time.time()

    # Collect full response
    response_parts = []
    async for token in llm_service.astream_chat([], prompt, max_tokens=4096, temperature=0.2):
        response_parts.append(token)
    response = "".join(response_parts)

    backend_code, frontend_html = _extract_artifacts(response)

    status = "success"
    errors = []

    if backend_code:
        (app_dir / "backend.py").write_text(backend_code, encoding="utf-8")
    else:
        errors.append("Failed to extract backend code")
        status = "partial"

    if frontend_html:
        (app_dir / "index.html").write_text(frontend_html, encoding="utf-8")
    else:
        errors.append("Failed to extract frontend HTML")
        status = "partial"

    manifest = {
        "slug": slug,
        "name": app_name,
        "description": description,
        "context": context,
        "created_at": time.time(),
        "generation_time_s": round(time.time() - t0, 1),
        "status": status,
        "errors": errors,
        "has_backend": backend_code is not None,
        "has_frontend": frontend_html is not None,
    }
    (app_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    log.info("App '%s' generated in %.1fs — status: %s", slug, manifest["generation_time_s"], status)
    return manifest


def list_generated_apps() -> list[dict]:
    """Return manifests of all generated apps."""
    apps = []
    for manifest_file in sorted(GENERATED_APPS_DIR.glob("*/manifest.json")):
        try:
            apps.append(json.loads(manifest_file.read_text()))
        except Exception:
            pass
    return apps


def get_app_frontend(slug: str) -> Optional[str]:
    """Return frontend HTML for a generated app."""
    html_file = GENERATED_APPS_DIR / slug / "index.html"
    if html_file.exists():
        return html_file.read_text(encoding="utf-8")
    return None


def delete_app(slug: str) -> bool:
    """Remove a generated app from disk."""
    import shutil
    app_dir = GENERATED_APPS_DIR / slug
    if app_dir.exists():
        shutil.rmtree(app_dir)
        return True
    return False
