"""Inicia o Radar Imóveis: API + interface em http://127.0.0.1:8765"""

import asyncio
import os
import sys
import threading
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "backend"))

import uvicorn  # noqa: E402

HOST = "127.0.0.1"
PORT = int(os.environ.get("RADAR_PORT", "8765"))


def main() -> None:
    # O Playwright precisa do ProactorEventLoop no Windows (subprocessos).
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

    from app import app  # noqa: E402

    if not (ROOT / "frontend" / "dist" / "index.html").exists():
        print("\n[!] Interface não compilada. Rode:  cd frontend && npm install && npm run build\n")

    if not os.environ.get("RADAR_NO_OPEN"):
        def _open():
            time.sleep(1.5)
            webbrowser.open(f"http://{HOST}:{PORT}")
        threading.Thread(target=_open, daemon=True).start()

    config = uvicorn.Config(app, host=HOST, port=PORT, loop="none", log_level="info")
    asyncio.run(uvicorn.Server(config).serve())


if __name__ == "__main__":
    main()
