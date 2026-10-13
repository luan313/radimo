"""Gerencia um Chromium real (Playwright) com perfil persistente.

Cada portal ganha uma aba própria, aberta na origem do site. Os scrapers (arquivos .js)
rodam dentro dessa aba via ``page.evaluate``, então as requisições saem com os mesmos
cookies, TLS e cabeçalhos de um navegador de verdade — o que evita a maior parte dos
bloqueios anti-bot (Cloudflare etc.).
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
from pathlib import Path

from playwright.async_api import BrowserContext, Page, async_playwright

log = logging.getLogger("radar.browser")

ROOT = Path(__file__).resolve().parent
SCRAPERS_DIR = ROOT / "scrapers"
PROFILE_DIR = ROOT.parent / ".browser-profile"

# offscreen: janela real fora da tela (mais confiável contra anti-bot) — padrão
# headless : sem janela (mais discreto; alguns sites podem bloquear)
# visible  : janela visível (útil para resolver um captcha manualmente uma vez)
MODE = os.environ.get("RADAR_BROWSER", "offscreen").strip().lower()

CHALLENGE_TITLES = re.compile(r"just a moment|um momento|attention required|verifica", re.I)
BLOCKED_TYPES = {"image", "media", "font"}


def load_script(name: str) -> str:
    """Lê um scraper .js e remove os comentários iniciais (o evaluate espera uma função)."""
    src = (SCRAPERS_DIR / name).read_text(encoding="utf-8")
    lines = src.splitlines()
    while lines and (lines[0].strip().startswith("//") or not lines[0].strip()):
        lines.pop(0)
    return "\n".join(lines)


class BrowserPool:
    def __init__(self) -> None:
        self._pw = None
        self._ctx: BrowserContext | None = None
        self._pages: dict[str, Page] = {}
        self._locks: dict[str, asyncio.Lock] = {}
        self._start_lock = asyncio.Lock()
        self._scripts: dict[str, str] = {}
        self._alive = False
        self._channel: str | None = None
        # Sessões temporárias com login manual (ex.: Facebook). Ficam só na memória.
        self._sessions: dict[str, dict] = {}

    async def start(self) -> None:
        async with self._start_lock:
            if self._ctx and self._alive:
                return
            await self._reset()
            self._pw = await async_playwright().start()
            headless = MODE == "headless"
            args = ["--disable-blink-features=AutomationControlled", "--lang=pt-BR"]
            if MODE == "offscreen":
                args += ["--window-position=-2400,-2400", "--window-size=1280,900"]
            opts = dict(
                user_data_dir=str(PROFILE_DIR),
                headless=headless,
                args=args,
                locale="pt-BR",
                timezone_id="America/Sao_Paulo",
                viewport={"width": 1280, "height": 900},
                ignore_default_args=["--enable-automation"],
            )
            # Prefere o Google Chrome instalado (menos detectável); cai no Chromium do Playwright.
            for channel in ("chrome", "msedge", None):
                try:
                    kw = dict(opts)
                    if channel:
                        kw["channel"] = channel
                    self._ctx = await self._pw.chromium.launch_persistent_context(**kw)
                    self._channel = channel
                    log.info("Navegador iniciado (%s, modo=%s)", channel or "chromium", MODE)
                    break
                except Exception as e:  # noqa: BLE001
                    log.debug("Canal %s indisponível: %s", channel, e)
            if not self._ctx:
                raise RuntimeError(
                    "Não consegui abrir o navegador. Rode: python -m playwright install chromium"
                )
            self._alive = True
            self._ctx.on("close", lambda *_: self._mark_dead())
            # IMPORTANTE: não fechar a aba inicial. Com o Chrome instalado, fechar a
            # última aba encerra o navegador inteiro. Ela fica em branco, como "âncora".
            if not self._ctx.pages:
                await self._ctx.new_page()

    def _mark_dead(self) -> None:
        if not self._alive:
            return
        log.warning("O navegador foi fechado; ele será reaberto na próxima busca.")
        self._alive = False

    async def _reset(self) -> None:
        """Descarta um navegador que morreu (ou foi fechado pelo usuário)."""
        self._pages.clear()
        if self._ctx:
            try:
                await self._ctx.close()
            except Exception:  # noqa: BLE001
                pass
        if self._pw:
            try:
                await self._pw.stop()
            except Exception:  # noqa: BLE001
                pass
        self._ctx = None
        self._pw = None

    async def stop(self) -> None:
        self._alive = False
        for name in list(self._sessions):
            await self.close_session(name)
        if self._ctx:
            await self._ctx.close()
        if self._pw:
            await self._pw.stop()
        self._ctx = None
        self._pw = None
        self._pages.clear()

    def script(self, name: str) -> str:
        if name not in self._scripts or os.environ.get("RADAR_DEV"):
            self._scripts[name] = load_script(name)
        return self._scripts[name]

    async def _open(self, key: str, origin: str) -> Page:
        assert self._ctx
        page = await self._ctx.new_page()

        async def _route(route):
            if route.request.resource_type in BLOCKED_TYPES:
                await route.abort()
            else:
                await route.continue_()

        await page.route("**/*", _route)
        await self._goto(page, origin)
        self._pages[key] = page
        return page

    async def _goto(self, page: Page, origin: str) -> None:
        await page.goto(origin, wait_until="domcontentloaded", timeout=45_000)
        # Espera eventual desafio do Cloudflare se resolver sozinho.
        for _ in range(30):
            title = await page.title()
            if not CHALLENGE_TITLES.search(title or ""):
                return
            await asyncio.sleep(1)
        log.warning("Desafio anti-bot não resolvido em %s", origin)

    async def run(self, key: str, origin: str, script: str, params: dict, timeout: float = 60) -> object:
        """Executa um scraper numa aba do portal. Reabre a aba e tenta de novo se falhar."""
        await self.start()
        lock = self._locks.setdefault(key, asyncio.Lock())
        async with lock:
            code = self.script(script)
            for attempt in (1, 2):
                await self.start()  # reabre o navegador se ele tiver sido fechado
                page = self._pages.get(key)
                try:
                    if page is None or page.is_closed():
                        page = await self._open(key, origin)
                    return await asyncio.wait_for(page.evaluate(code, params), timeout)
                except Exception as e:  # noqa: BLE001
                    msg = str(e)
                    log.warning("[%s] tentativa %s falhou: %s", key, attempt, msg[:300])
                    if attempt == 2 or "não reconhecida" in msg:
                        raise
                    if "has been closed" in msg or "Target closed" in msg:
                        self._alive = False  # navegador caiu: start() reabre na próxima tentativa
                        continue
                    # Renova a sessão (cookies/desafio) e tenta de novo.
                    try:
                        if page and not page.is_closed():
                            await self._goto(page, origin)
                        else:
                            self._pages.pop(key, None)
                    except Exception:  # noqa: BLE001
                        self._pages.pop(key, None)
        return None

    # ------------------------------------------------------------------
    # Páginas que precisam ser abertas e roladas (Facebook, Mercado Livre)
    # ------------------------------------------------------------------
    async def run_navigate(
        self,
        key: str,
        url: str,
        script: str,
        params: dict,
        session: str | None = None,
        scrolls: int = 3,
        timeout: float = 60,
    ) -> object:
        """Abre a URL numa aba, rola a página para carregar mais cards e roda o extrator."""
        await self.start()
        sess = self._sessions.get(session or "")
        use_session = bool(sess and self._session_alive(sess) and sess.get("connected"))
        scope = f"{session}:{key}" if use_session else key
        lock = self._locks.setdefault(scope, asyncio.Lock())
        async with lock:
            code = self.script(script)
            pages = sess["pages"] if use_session else self._pages
            page = pages.get(key)
            if page is None or page.is_closed():
                ctx = sess["ctx"] if use_session else self._ctx
                page = await ctx.new_page()
                pages[key] = page
            await page.goto(url, wait_until="domcontentloaded", timeout=45_000)
            await asyncio.sleep(2.5)
            for _ in range(scrolls):
                await page.evaluate("window.scrollBy(0, 2600)")
                await asyncio.sleep(1.3)
            return await asyncio.wait_for(page.evaluate(code, params), timeout)

    # ------------------------------------------------------------------
    # Sessões temporárias com login feito pelo próprio usuário
    # ------------------------------------------------------------------
    @staticmethod
    def _session_alive(sess: dict) -> bool:
        try:
            return sess["browser"].is_connected()
        except Exception:  # noqa: BLE001
            return False

    async def open_login(self, name: str, url: str) -> None:
        """Abre uma janela VISÍVEL e anônima (sem perfil salvo) para o usuário fazer login.

        Nada é gravado em disco: ao fechar o app (ou desconectar), a sessão some.
        O app nunca vê nem digita a senha — quem faz login é o próprio usuário na janela.
        """
        await self.start()
        await self.close_session(name)
        kw = dict(headless=False, args=["--disable-blink-features=AutomationControlled", "--lang=pt-BR"],
                  ignore_default_args=["--enable-automation"])
        if self._channel:
            kw["channel"] = self._channel
        browser = await self._pw.chromium.launch(**kw)
        ctx = await browser.new_context(locale="pt-BR", timezone_id="America/Sao_Paulo", no_viewport=True)
        page = await ctx.new_page()
        await page.goto(url, wait_until="domcontentloaded")
        await page.bring_to_front()
        self._sessions[name] = {"browser": browser, "ctx": ctx, "pages": {}, "login_page": page, "connected": False}
        log.info("Janela de login aberta para %s (sessão temporária, nada é salvo).", name)

    async def session_status(self, name: str, cookie_names: list[str]) -> str:
        sess = self._sessions.get(name)
        if not sess:
            return "disconnected"
        if not self._session_alive(sess):
            self._sessions.pop(name, None)
            return "disconnected"
        try:
            cookies = await sess["ctx"].cookies()
        except Exception:  # noqa: BLE001
            return "disconnected"
        ok = any(c["name"] in cookie_names and c.get("value") for c in cookies)
        if ok and not sess["connected"]:
            sess["connected"] = True
            log.info("Sessão %s conectada.", name)
            await self._minimize(sess.get("login_page"))
        return "connected" if ok else "pending"

    async def _minimize(self, page: Page | None) -> None:
        """Minimiza a janela de login depois que o usuário entrou (as buscas usam abas dela)."""
        if not page or page.is_closed():
            return
        try:
            cdp = await page.context.new_cdp_session(page)
            win = await cdp.send("Browser.getWindowForTarget")
            await cdp.send("Browser.setWindowBounds", {"windowId": win["windowId"], "bounds": {"windowState": "minimized"}})
        except Exception as e:  # noqa: BLE001
            log.debug("Não consegui minimizar a janela: %s", e)

    async def close_session(self, name: str) -> None:
        sess = self._sessions.pop(name, None)
        if not sess:
            return
        for k in [k for k in self._locks if k.startswith(f"{name}:")]:
            self._locks.pop(k, None)
        try:
            await sess["browser"].close()
        except Exception:  # noqa: BLE001
            pass
        log.info("Sessão %s encerrada e descartada.", name)
