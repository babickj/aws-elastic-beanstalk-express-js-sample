"""
llama.cpp integration via llama-cpp-python.

The LLMService is a singleton loaded once at startup after hardware detection.
It exposes synchronous and async streaming chat completions.
"""
import asyncio
import json
import logging
from pathlib import Path
from typing import AsyncIterator, Iterator, Optional

from ..config import MODELS_DIR, DEFAULT_CONTEXT_LENGTH, DEFAULT_THREADS, DEFAULT_GPU_LAYERS

log = logging.getLogger("warclaw.llm")

SYSTEM_PROMPT = """You are WarClaw, an AI operating system assistant built by EdgeRunner AI for naval ship LANs.
You run 100% locally — no cloud, no internet required.
You help crew members:
 1. Understand what systems are on the ship's LAN
 2. Build new applications that integrate with those systems
 3. Parse and interpret sensor data (NMEA, MODBUS, IEC 61162, etc.)
 4. Write production-quality Python + HTML/JS code when asked

When asked to create an app, output complete, runnable code.
Be concise. Use naval/maritime terminology where appropriate.
"""


class LLMService:
    def __init__(self):
        self._llm = None
        self._model_path: Optional[str] = None
        self._ready = False

    @property
    def ready(self) -> bool:
        return self._ready

    @property
    def model_path(self) -> Optional[str]:
        return self._model_path

    def load(self, model_path: str, n_ctx: int = DEFAULT_CONTEXT_LENGTH,
             n_threads: int = DEFAULT_THREADS, n_gpu_layers: int = DEFAULT_GPU_LAYERS) -> None:
        """Load a GGUF model. Blocks until loaded."""
        from llama_cpp import Llama  # type: ignore

        path = Path(model_path)
        if not path.exists():
            raise FileNotFoundError(f"Model not found: {model_path}")

        log.info("Loading model %s (ctx=%d, threads=%d, gpu_layers=%d)",
                 path.name, n_ctx, n_threads, n_gpu_layers)

        self._llm = Llama(
            model_path=str(path),
            n_ctx=n_ctx,
            n_threads=n_threads,
            n_gpu_layers=n_gpu_layers,
            chat_format="chatml",
            verbose=False,
        )
        self._model_path = str(path)
        self._ready = True
        log.info("Model loaded: %s", path.name)

    def list_available_models(self) -> list[dict]:
        """Return GGUF files found in the models directory."""
        models = []
        for f in sorted(MODELS_DIR.glob("*.gguf")):
            models.append({"name": f.name, "path": str(f), "size_mb": round(f.stat().st_size / 1e6, 1)})
        return models

    def _build_messages(self, history: list[dict], user_message: str) -> list[dict]:
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        for turn in history:
            messages.append({"role": turn["role"], "content": turn["content"]})
        messages.append({"role": "user", "content": user_message})
        return messages

    def stream_chat(self, history: list[dict], user_message: str,
                    max_tokens: int = 2048, temperature: float = 0.7) -> Iterator[str]:
        """Synchronous streaming generator — yields token strings."""
        if not self._ready or self._llm is None:
            yield "[WarClaw] No model loaded. Please load a GGUF model first."
            return

        messages = self._build_messages(history, user_message)
        stream = self._llm.create_chat_completion(
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            stream=True,
        )
        for chunk in stream:
            delta = chunk["choices"][0]["delta"]
            token = delta.get("content", "")
            if token:
                yield token

    async def astream_chat(self, history: list[dict], user_message: str,
                           max_tokens: int = 2048, temperature: float = 0.7) -> AsyncIterator[str]:
        """Async wrapper — runs sync stream in thread pool to avoid blocking."""
        loop = asyncio.get_event_loop()
        queue: asyncio.Queue[Optional[str]] = asyncio.Queue()

        def _run():
            try:
                for token in self.stream_chat(history, user_message, max_tokens, temperature):
                    loop.call_soon_threadsafe(queue.put_nowait, token)
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, None)

        loop.run_in_executor(None, _run)

        while True:
            token = await queue.get()
            if token is None:
                break
            yield token

    def chat_once(self, history: list[dict], user_message: str,
                  max_tokens: int = 2048, temperature: float = 0.7) -> str:
        """Non-streaming, returns full response string."""
        return "".join(self.stream_chat(history, user_message, max_tokens, temperature))


# Module-level singleton
llm_service = LLMService()
