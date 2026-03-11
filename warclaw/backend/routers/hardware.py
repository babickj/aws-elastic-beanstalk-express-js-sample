"""Hardware detection and model management endpoints."""
import os
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services.hardware import detect_hardware
from ..services.llm import llm_service
from ..config import MODELS_DIR, DEFAULT_CONTEXT_LENGTH, DEFAULT_THREADS

router = APIRouter(prefix="/api/hardware", tags=["hardware"])


@router.get("/profile")
def get_hardware_profile():
    """Return detected hardware profile and model recommendation."""
    profile = detect_hardware()
    return {
        "cpu_cores": profile.cpu_cores,
        "cpu_model": profile.cpu_model,
        "ram_gb": profile.ram_gb,
        "gpu_name": profile.gpu_name,
        "gpu_vram_gb": profile.gpu_vram_gb,
        "has_cuda": profile.has_cuda,
        "recommended_tier": profile.recommended_tier,
        "recommended_gpu_layers": profile.recommended_gpu_layers,
        "recommended_model": profile.recommended_model_hint,
        "notes": profile.notes,
    }


@router.get("/models")
def list_models():
    """List GGUF model files available in the models/ directory."""
    models = llm_service.list_available_models()
    return {
        "models": models,
        "models_dir": str(MODELS_DIR),
        "current_model": llm_service.model_path,
        "model_ready": llm_service.ready,
    }


class LoadModelRequest(BaseModel):
    model_path: str
    n_ctx: int = DEFAULT_CONTEXT_LENGTH
    n_threads: int = DEFAULT_THREADS
    n_gpu_layers: int = 0


@router.post("/models/load")
def load_model(req: LoadModelRequest):
    """Load a GGUF model into memory."""
    try:
        llm_service.load(
            model_path=req.model_path,
            n_ctx=req.n_ctx,
            n_threads=req.n_threads,
            n_gpu_layers=req.n_gpu_layers,
        )
        return {"status": "loaded", "model": req.model_path}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
