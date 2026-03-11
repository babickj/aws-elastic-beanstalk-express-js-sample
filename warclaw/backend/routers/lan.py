"""
LAN monitoring endpoints — scan, discover, and stream live protocol data.
"""
import json
import logging
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from pydantic import BaseModel
from typing import Optional

from ..services.lan_monitor import scan_network, stream_protocol_traffic
from ..protocols.modbus import probe_modbus

log = logging.getLogger("warclaw.lan")
router = APIRouter(prefix="/api/lan", tags=["lan"])


@router.get("/scan")
async def lan_scan(network: Optional[str] = Query(None, description="CIDR network e.g. 192.168.1.0/24")):
    """
    Perform a full LAN discovery scan.
    Finds hosts, identifies services, and returns integration recommendations.
    """
    log.info("LAN scan requested, network=%s", network or "auto-detect")
    result = await scan_network(network=network)

    return {
        "network": result.network,
        "hosts_scanned": result.hosts_scanned,
        "hosts_up": result.hosts_up,
        "scan_duration_s": result.scan_duration_s,
        "recommendations": result.recommendations,
        "hosts": [
            {
                "ip": h.ip,
                "hostname": h.hostname,
                "open_ports": h.open_ports,
                "services": [
                    {
                        "port": s.port,
                        "protocol": s.protocol,
                        "banner": s.banner,
                        "latency_ms": s.latency_ms,
                    }
                    for s in h.services
                ],
                "integration_hints": h.integration_hints,
            }
            for h in result.discovered
        ],
    }


class ModbusScanRequest(BaseModel):
    host: str
    port: int = 502
    unit_id: int = 1


@router.post("/modbus/probe")
async def probe_modbus_device(req: ModbusScanRequest):
    """Probe a specific MODBUS TCP endpoint and read registers."""
    device = await probe_modbus(req.host, req.port, req.unit_id)
    return {
        "host": device.host,
        "port": device.port,
        "unit_id": device.unit_id,
        "reachable": device.reachable,
        "coils": device.coils,
        "holding_registers": device.holding_registers,
        "error": device.error,
    }


@router.websocket("/stream")
async def stream_lan_traffic(ws: WebSocket):
    """
    WebSocket: connect to a discovered NMEA/IEC service and stream decoded data.

    Client sends JSON: {"host": "192.168.1.10", "port": 10110, "max_messages": 100}
    Server streams JSON protocol frames until done or disconnect.
    """
    await ws.accept()
    log.info("LAN stream WebSocket connected")

    try:
        raw = await ws.receive_text()
        params = json.loads(raw)
        host = params.get("host", "")
        port = int(params.get("port", 10110))
        max_msgs = int(params.get("max_messages", 100))

        if not host:
            await ws.send_json({"error": "host is required"})
            await ws.close()
            return

        await ws.send_json({"status": "connecting", "host": host, "port": port})

        async for frame in stream_protocol_traffic(host, port, max_msgs):
            await ws.send_json(frame)

        await ws.send_json({"status": "complete"})
    except WebSocketDisconnect:
        log.info("LAN stream WebSocket disconnected")
    except Exception as e:
        log.exception("LAN stream error")
        try:
            await ws.send_json({"error": str(e)})
        except Exception:
            pass
