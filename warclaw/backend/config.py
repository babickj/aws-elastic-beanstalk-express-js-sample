"""WarClaw configuration — all settings derived from environment or defaults."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent

# Paths
MODELS_DIR = BASE_DIR / "models"
GENERATED_APPS_DIR = BASE_DIR / "generated_apps"
FRONTEND_DIR = BASE_DIR / "frontend"
MISSION_LOG_PATH = BASE_DIR / "mission_log.jsonl"

# Server
HOST = os.getenv("WARCLAW_HOST", "0.0.0.0")
PORT = int(os.getenv("WARCLAW_PORT", "7070"))

# Security — set WARCLAW_API_KEY to require a key on all API requests.
# Leave blank (default) for open LAN access.
API_KEY = os.getenv("WARCLAW_API_KEY", "")

# LLM — model path is set after hardware detection or manually via env
DEFAULT_MODEL_PATH = os.getenv("WARCLAW_MODEL", "")
DEFAULT_CONTEXT_LENGTH = int(os.getenv("WARCLAW_CTX", "4096"))
DEFAULT_THREADS = int(os.getenv("WARCLAW_THREADS", str(os.cpu_count() or 4)))
DEFAULT_GPU_LAYERS = int(os.getenv("WARCLAW_GPU_LAYERS", "0"))  # 0 = CPU only

# LAN Monitoring
SCAN_TIMEOUT = float(os.getenv("WARCLAW_SCAN_TIMEOUT", "3.0"))
MONITOR_INTERFACE = os.getenv("WARCLAW_IFACE", "")  # blank = auto-detect

# Protocol ports
NMEA_TCP_PORTS = [10110, 2000, 4001, 3960]
MODBUS_TCP_PORT = 502
IEC61162_PORTS = [10110, 4001]

# App branding
APP_NAME = "WarClaw"
APP_SUBTITLE = "EdgeRunner AI — Naval LAN Operating System"
APP_VERSION = "2.1.0"
