"""API do Radar Imóveis.

GET /api/sources               -> portais disponíveis
GET /api/locations?q=&kind=    -> autocomplete de cidade/bairro
GET /api/search?...            -> busca em todos os portais (Server-Sent Events: um evento por portal)
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import unicodedata
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from browser import BrowserPool
import mock

MOCK = bool(os.environ.get("RADAR_MOCK"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("radar")

FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

SOURCES: dict[str, dict] = {
    "zap": {
        "name": "ZAP Imóveis",
        "origin": "https://www.zapimoveis.com.br/",
        "script": "glue.js",
        "extra": {"portal": "ZAP"},
        "color": "#ff5a00",
    },
    "vivareal": {
        "name": "Viva Real",
        "origin": "https://www.vivareal.com.br/",
        "script": "glue.js",
        "extra": {"portal": "VIVAREAL"},
        "color": "#1b5bd6",
    },
    "olx": {
        "name": "OLX",
        "origin": "https://www.olx.com.br/imoveis",
        "script": "olx.js",
        "extra": {},
        "color": "#8a2be2",
    },
    "quintoandar": {
        "name": "QuintoAndar",
        "origin": "https://www.quintoandar.com.br/",
        "script": "quintoandar.js",
        "extra": {},
        "color": "#3d5ce5",
    },
    "imovelweb": {
        "name": "Imovelweb",
        "origin": "https://www.imovelweb.com.br/",
        "script": "imovelweb.js",
        "extra": {},
        "color": "#f26a21",
        "group": "navent",  # mesmo catálogo/IDs do Wimoveis
    },
    "chavesnamao": {
        "name": "Chaves na Mão",
        "origin": "https://www.chavesnamao.com.br/",
        "script": "chavesnamao.js",
        "extra": {},
        "color": "#e4002b",
    },
    "imoveis62": {
        "name": "62imoveis",
        "origin": "https://www.62imoveis.com.br/",
        "script": "imoveis62.js",
        "extra": {},
        "color": "#0f8a5f",
        "ufs": ["GO", "DF", "TO", "CE", "PB", "PR", "RJ", "RN", "SP"],
    },
    "mgf": {
        "name": "MGF Imóveis",
        "origin": "https://www.mgfimoveis.com.br/",
        "script": "mgf.js",
        "extra": {},
        "color": "#d97706",
    },
    "wimoveis": {
        "name": "Wimoveis",
        "origin": "https://www.wimoveis.com.br/",
        "script": "wimoveis.js",
        "extra": {},
        "color": "#e8590c",
        "group": "navent",
        "ufs": ["GO", "DF"],
    },
    "marco": {
        "name": "Marco Imobiliária",
        "origin": "https://www.marcoimb.com.br/",
        "script": "arbo.js",
        "extra": {},
        "color": "#7c3aed",
        "once": True,  # baixa o catálogo inteiro da imobiliária uma vez só
        "ufs": ["GO"],
    },
    "federal": {
        "name": "Federal Imóveis",
        "origin": "https://federalimoveis.com.br/",
        "script": "wpimoveis.js",
        "extra": {},
        "color": "#0e7490",
        "once": True,
        "ufs": ["GO"],
    },
    "mercadolivre": {
        "name": "Mercado Livre",
        "origin": "https://imoveis.mercadolivre.com.br/",
        "script": "mercadolivre.js",
        "extra": {},
        "color": "#e6b800",
        "mode": "navigate",
        "session": "mercadolivre",
        # Pouquíssimos imóveis hoje e exige login para automação: fica desmarcado por padrão.
        "defaultOff": True,
    },
    "facebook": {
        "name": "Facebook",
        "origin": "https://www.facebook.com/marketplace/",
        "script": "facebook.js",
        "extra": {},
        "color": "#1877f2",
        "mode": "navigate",
        "session": "facebook",
    },
}

# Login manual e temporário (janela visível; nada é salvo em disco).
SESSIONS = {
    "facebook": {
        "name": "Facebook",
        "login_url": "https://www.facebook.com/login",
        "cookies": ["c_user"],
    },
    "mercadolivre": {
        "name": "Mercado Livre",
        "login_url": "https://www.mercadolivre.com/jms/mlb/lgz/login",
        "cookies": ["orguseridp", "orgnickp", "ssid"],
    },
}
_mock_sessions: dict[str, str] = {}

pool = BrowserPool()
_cache: dict[str, tuple[float, object]] = {}
CACHE_TTL = 10 * 60


def cache_get(key: str):
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < CACHE_TTL:
        return hit[1]
    return None


def cache_set(key: str, value) -> None:
    _cache[key] = (time.time(), value)
    if len(_cache) > 300:
        for k in sorted(_cache, key=lambda k: _cache[k][0])[:100]:
            _cache.pop(k, None)


def norm(s: str | None) -> str:
    s = unicodedata.normalize("NFD", s or "")
    return "".join(c for c in s if unicodedata.category(c) != "Mn").lower().strip()


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Aquece o navegador em segundo plano para a primeira busca ser mais rápida.
    if MOCK:
        log.info("Modo demonstração (RADAR_MOCK=1): nenhum portal será acessado.")
    else:
        asyncio.create_task(_warmup())
    yield
    await pool.stop()


async def _warmup():
    try:
        await pool.start()
        res = await asyncio.gather(
            *(pool.run(k, s["origin"], "noop.js", {}) for k, s in SOURCES.items() if s.get("mode") != "navigate"),
            return_exceptions=True,
        )
        ok = sum(1 for r in res if not isinstance(r, Exception))
        log.info("Abas dos portais prontas: %s de %s.", ok, len(res))
    except Exception as e:  # noqa: BLE001
        log.warning("Aquecimento falhou: %s", e)


app = FastAPI(title="Radar Imóveis", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/api/sources")
async def sources():
    return [
        {
            "id": k,
            "name": v["name"],
            "color": v["color"],
            "ufs": v.get("ufs"),
            "session": v.get("session"),
            "defaultOff": v.get("defaultOff", False),
        }
        for k, v in SOURCES.items()
    ]


@app.get("/api/sessions")
async def sessions():
    out = {}
    for name, cfg in SESSIONS.items():
        st = _mock_sessions.get(name, "disconnected") if MOCK else await pool.session_status(name, cfg["cookies"])
        out[name] = {"name": cfg["name"], "status": st}
    return out


@app.post("/api/sessions/{name}/connect")
async def session_connect(name: str):
    if name not in SESSIONS:
        return JSONResponse({"error": "sessão desconhecida"}, status_code=404)
    if MOCK:
        _mock_sessions[name] = "connected"
        return {"status": "connected"}
    try:
        await pool.open_login(name, SESSIONS[name]["login_url"])
    except Exception as e:  # noqa: BLE001
        return JSONResponse({"error": str(e)[:200]}, status_code=500)
    return {"status": "pending"}


@app.post("/api/sessions/{name}/disconnect")
async def session_disconnect(name: str):
    if MOCK:
        _mock_sessions.pop(name, None)
    else:
        await pool.close_session(name)
    return {"status": "disconnected"}


@app.get("/api/locations")
async def locations(
    q: str = Query(..., min_length=2),
    kind: str = Query("city", pattern="^(city|neighborhood)$"),
    city: str | None = None,
    business: str = "rent",
):
    key = f"loc|{kind}|{norm(q)}|{norm(city)}|{business}"
    if (hit := cache_get(key)) is not None:
        return hit
    try:
        if MOCK:
            return mock.locations(q, kind, city)
        res = await pool.run(
            "locations",
            SOURCES["zap"]["origin"],
            "locations.js",
            {"q": q, "kind": kind, "city": city, "business": business},
            timeout=20,
        )
    except Exception as e:  # noqa: BLE001
        return JSONResponse({"error": str(e)[:200]}, status_code=502)
    # remove duplicados mantendo a ordem
    seen, out = set(), []
    for r in res or []:
        k = (r["city"], r["state"], r.get("neighborhood"))
        if k not in seen:
            seen.add(k)
            out.append(r)
    cache_set(key, out)
    return out


def nb_key(s: str | None) -> str:
    """Normaliza nome de bairro para comparação ("Setor Asa Branca" ~ "Asa Branca")."""
    n = norm(s)
    for pre in ("setor ", "st. ", "st "):
        if n.startswith(pre):
            n = n[len(pre):]
    return n


def post_filter(items: list[dict], p: dict, source: str) -> list[dict]:
    """Aplica os filtros de novo no backend (nem todo portal respeita todos na URL)."""
    out = []
    wanted = [nb_key(n["neighborhood"]) for n in p["neighborhoods"] if n.get("neighborhood")]
    city = norm(p["location"].get("city"))
    seen: set[str] = set()
    for it in items:
        if str(it.get("id")) in seen:
            continue
        seen.add(str(it.get("id")))
        price = it.get("price")
        if price is not None:
            if p.get("priceMin") and price < p["priceMin"]:
                continue
            if p.get("priceMax") and price > p["priceMax"]:
                continue
        beds = it.get("bedrooms")
        if p.get("bedrooms") and beds is not None and beds < p["bedrooms"]:
            continue
        if city and it.get("city") and norm(it["city"]) != city:
            continue
        item_nb = nb_key(it.get("neighborhood"))
        # Sem bairro no anúncio (ex.: Facebook só informa a cidade): não dá para excluir.
        it["exactNeighborhood"] = (not wanted) or (not item_nb) or any(
            w in item_nb or item_nb in w for w in wanted
        )
        area = it.get("area")
        it["pricePerM2"] = round(price / area) if price and area else None
        it["source"] = source
        # ZAP e Viva Real compartilham IDs: prefixo comum ajuda a unificar no front.
        group = "glue" if source in ("zap", "vivareal") else SOURCES[source].get("group", source)
        it["key"] = f"{group}:{it['id']}"
        for f in ("title", "neighborhood", "city", "address", "image", "url"):
            it.setdefault(f, None)
        out.append(it)
    return out


async def _call(source: str, params: dict) -> dict:
    s = SOURCES[source]
    if MOCK:
        return await mock.run(source, params)
    return await pool.run(source, s["origin"], s["script"], {**params, **s["extra"]}, timeout=90)


def _slug(s: str | None) -> str:
    n = norm(s)
    out = "".join(c if c.isalnum() else "-" for c in n)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-")


def _nav_urls(source: str, params: dict) -> list[tuple[str, dict]]:
    """URLs a abrir para portais que precisam de navegação real (uma por bairro)."""
    from urllib.parse import quote, urlencode

    loc = params["location"]
    nbs = [n["neighborhood"] for n in params["neighborhoods"]] or [""]
    rent = params["business"] == "rent"
    out = []
    for nb in nbs:
        if source == "facebook":
            city = _slug(loc["city"]).replace("-", "")
            q = {}
            if params.get("priceMin"):
                q["minPrice"] = params["priceMin"]
            if params.get("priceMax"):
                q["maxPrice"] = params["priceMax"]
            if nb:
                q["query"] = f"{'aluguel' if rent else 'venda'} {nb}"
                url = f"https://www.facebook.com/marketplace/{city}/search?{urlencode(q, quote_via=quote)}"
            else:
                cat = "propertyrentals" if rent else "propertyforsale"
                url = f"https://www.facebook.com/marketplace/{city}/{cat}" + (f"?{urlencode(q)}" if q else "")
        else:  # mercadolivre
            parts = ["aluguel" if rent else "venda", _slug(loc.get("state")), _slug(loc["city"])]
            if nb:
                parts.append(_slug(nb))
            url = "https://imoveis.mercadolivre.com.br/" + "/".join(parts) + "/"
            if params.get("priceMax"):
                url += f"_PriceRange_{params.get('priceMin') or 0}-{params['priceMax']}"
        out.append((url, {**loc, "neighborhood": nb}))
    return out


async def scrape(source: str, params: dict) -> dict:
    """Roda o scraper do portal cobrindo todos os bairros escolhidos."""
    s = SOURCES[source]
    nbs = params["neighborhoods"]
    base_loc = params["location"]

    if s.get("ufs") and (base_loc.get("uf") or "").upper() not in s["ufs"]:
        return {"items": [], "total": 0, "skip": f"{s['name']} só cobre: {', '.join(s['ufs'])}", "label": "fora da região"}

    if s.get("mode") == "navigate":
        items, errors = [], []
        for url, loc in _nav_urls(source, params):
            try:
                if MOCK:
                    res = await mock.run(source, {**params, "location": loc})
                else:
                    res = await pool.run_navigate(
                        source, url, s["script"], {**params, "location": loc}, session=s.get("session")
                    )
                items += res.get("items", [])
            except Exception as e:  # noqa: BLE001
                errors.append(f"{loc['neighborhood'] or loc['city']}: {str(e).splitlines()[0]}")
        if errors and not items:
            first = errors[0].split(": ", 1)[-1]
            if "LOGIN_REQUIRED" in first:
                return {"items": [], "total": 0, "skip": first.split("LOGIN_REQUIRED:", 1)[-1].strip(), "label": "precisa de login"}
            raise RuntimeError(first)
        return {"items": items, "total": len(items)}

    if s.get("once") or not nbs:
        return await _call(source, {**params, "location": {**base_loc, "neighborhood": "", "zone": ""}})

    if source in ("zap", "vivareal"):
        # A API do Grupo OLX aceita vários bairros numa chamada só (IDs separados por vírgula).
        known = [n for n in nbs if n.get("locationId")]
        loc = {**base_loc, "neighborhood": "", "zone": ""}
        if known:
            loc["locationIds"] = [n["locationId"] for n in known]
            loc["neighborhoodNames"] = [n["neighborhood"] for n in known]
        # Bairros digitados à mão (sem ID): busca a cidade e o filtro de bairro separa depois.
        pages = params["pages"] if known else max(params["pages"], 4)
        return await _call(source, {**params, "pages": pages, "location": loc})

    # Demais portais: uma busca por bairro, em sequência (mesma aba do navegador).
    pages = params["pages"] if len(nbs) <= 2 else 1
    items: list[dict] = []
    total = 0
    errors: list[str] = []
    for n in nbs:
        loc = {**base_loc, "neighborhood": n["neighborhood"], "zone": n.get("zone") or ""}
        try:
            res = await _call(source, {**params, "pages": pages, "location": loc})
            items += res.get("items", [])
            total += res.get("total") or 0
        except Exception as e:  # noqa: BLE001
            errors.append(f"{n['neighborhood']}: {str(e).splitlines()[0]}")
    if errors and not items and len(errors) == len(nbs):
        raise RuntimeError(errors[0])
    return {"items": items, "total": total, "warnings": errors}


async def run_source(source: str, params: dict) -> dict:
    t0 = time.time()
    sess = SOURCES[source].get("session")
    sess_state = (_mock_sessions.get(sess) if MOCK else pool._sessions.get(sess, {}).get("connected")) if sess else None
    cache_key = f"src|{source}|{sess_state}|{json.dumps(params, sort_keys=True)}"
    if (hit := cache_get(cache_key)) is not None:
        return {**hit, "cached": True}
    try:
        res = await scrape(source, params)
        if res.get("skip"):
            return {"source": source, "status": "skipped", "reason": res["skip"], "label": res.get("label"), "items": [], "ms": 0}
        items = post_filter(list(res.get("items", [])), params, source)
        out = {
            "source": source,
            "status": "ok",
            "items": items,
            "total": res.get("total") or len(items),
            "ms": int((time.time() - t0) * 1000),
        }
        if sess and not sess_state:
            out["warning"] = "Sem login: o site mostra só parte dos anúncios. Conecte a conta para ver mais."
        if res.get("warnings"):
            out["warning"] = "Bairros não encontrados neste portal: " + ", ".join(
                w.split(":")[0] for w in res["warnings"]
            )
        cache_set(cache_key, out)
        return out
    except Exception as e:  # noqa: BLE001
        msg = str(e).split("\n")[0]
        msg = msg.replace("Error: ", "").replace("page.evaluate: ", "").replace("Page.evaluate: ", "")
        if "ERR_" in msg or "Timeout" in msg or "timeout" in msg:
            msg = "Não foi possível acessar o site agora (rede ou bloqueio temporário)."
        elif "HTTP 403" in msg or "HTTP 429" in msg:
            msg = "O site bloqueou a consulta temporariamente. Tente de novo em alguns minutos."
        log.warning("[%s] erro: %s", source, msg)
        return {
            "source": source,
            "status": "error",
            "error": msg[:240],
            "items": [],
            "ms": int((time.time() - t0) * 1000),
        }


def _int(v) -> int | None:
    try:
        return int(float(v)) if v not in (None, "") else None
    except ValueError:
        return None


@app.get("/api/search")
async def search(request: Request):
    qp = request.query_params
    loc = json.loads(qp.get("location", "{}"))
    if not loc.get("city"):
        return JSONResponse({"error": "Cidade obrigatória"}, status_code=400)
    params = {
        "business": "buy" if qp.get("business") == "buy" else "rent",
        "location": {
            "city": loc.get("city"),
            "state": loc.get("state"),
            "uf": loc.get("uf"),
            "neighborhood": "",
            "zone": "",
            "locationId": loc.get("locationId"),
        },
        # Lista de bairros: [{neighborhood, locationId (vazio se digitado à mão), zone}]
        "neighborhoods": [
            {
                "neighborhood": str(n.get("neighborhood") or "").strip(),
                "locationId": n.get("locationId") or "",
                "zone": n.get("zone") or "",
            }
            for n in json.loads(qp.get("neighborhoods", "[]"))[:10]
            if str(n.get("neighborhood") or "").strip()
        ],
        "priceMin": _int(qp.get("priceMin")),
        "priceMax": _int(qp.get("priceMax")),
        "bedrooms": _int(qp.get("bedrooms")),
        "pages": max(1, min(_int(qp.get("pages")) or 2, 5)),
    }
    wanted = [s for s in (qp.get("sources") or ",".join(SOURCES)).split(",") if s in SOURCES]

    async def stream():
        yield f"event: start\ndata: {json.dumps({'sources': wanted})}\n\n"
        tasks = [asyncio.create_task(run_source(s, params)) for s in wanted]
        for fut in asyncio.as_completed(tasks):
            res = await fut
            if await request.is_disconnected():
                break
            yield f"event: source\ndata: {json.dumps(res, ensure_ascii=False)}\n\n"
        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------- frontend compilado ----------
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    async def spa(path: str):
        f = FRONTEND_DIST / path
        if path and f.is_file():
            return FileResponse(f)
        return FileResponse(FRONTEND_DIST / "index.html")
