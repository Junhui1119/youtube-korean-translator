import json
from datetime import datetime, timezone


def log_translate_request(
    engine: str,
    text_len: int,
    latency_ms: int,
    status: str,
    error: str | None = None,
) -> None:
    record: dict = {
        "event": "translate",
        "engine": engine,
        "text_len": text_len,
        "latency_ms": latency_ms,
        "status": status,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    if error:
        record["error"] = error
    print(json.dumps(record), flush=True)
