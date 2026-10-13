"""Dados de demonstração (RADAR_MOCK=1): permite ver a interface sem acessar os portais."""

from __future__ import annotations

import asyncio
import random
from urllib.parse import quote

CITIES = [
    {"city": "São Paulo", "state": "São Paulo", "uf": "SP", "zone": "", "locationId": "BR>Sao Paulo>NULL>Sao Paulo"},
    {"city": "Campinas", "state": "São Paulo", "uf": "SP", "zone": "", "locationId": "BR>Sao Paulo>NULL>Campinas"},
    {"city": "Curitiba", "state": "Paraná", "uf": "PR", "zone": "", "locationId": "BR>Parana>NULL>Curitiba"},
    {"city": "Goiânia", "state": "Goiás", "uf": "GO", "zone": "", "locationId": "BR>Goias>NULL>Goiania"},
    {"city": "Rio de Janeiro", "state": "Rio de Janeiro", "uf": "RJ", "zone": "", "locationId": "BR>Rio de Janeiro>NULL>Rio de Janeiro"},
]
NEIGHBORHOODS = ["Jardim Guanabara", "Jardim Guanabará II", "Jardim Guanabará III", "Setor Asa Branca", "Cambuí", "Centro", "Taquaral", "Moema", "Pinheiros", "Botafogo", "Batel", "Jardim Europa", "Vila Madalena"]
STREETS = ["Rua das Palmeiras", "Av. Brasil", "Rua Coronel Quirino", "Alameda Santos", "Rua Barão de Jaguara", "Av. Norte-Sul"]
PALETTE = [("#2f4f46", "#d9c7a0"), ("#5b6d7a", "#e8e1d4"), ("#7a5c4f", "#efe3cf"), ("#3e5a74", "#dfe7ec"), ("#6b7b56", "#ece8d6")]


def _img(seed: int) -> str:
    a, b = PALETTE[seed % len(PALETTE)]
    svg = (
        f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 440'>"
        f"<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='{b}'/>"
        f"<stop offset='1' stop-color='{a}'/></linearGradient></defs><rect width='640' height='440' fill='url(#g)'/>"
        f"<rect x='{120 + seed % 60}' y='150' width='260' height='220' fill='{a}' opacity='.55'/>"
        f"<rect x='{330 + seed % 40}' y='90' width='180' height='280' fill='{a}' opacity='.75'/>"
        f"<g fill='{b}' opacity='.8'>" + "".join(
            f"<rect x='{350 + seed % 40 + c * 50}' y='{120 + r * 55}' width='28' height='32'/>" for r in range(4) for c in range(3)
        ) + "</g></svg>"
    )
    return "data:image/svg+xml;utf8," + quote(svg)


def locations(q: str, kind: str, city: str | None):
    ql = q.lower()
    if kind == "city":
        return [dict(c, neighborhood="") for c in CITIES if ql[:3] in c["city"].lower()] or [dict(CITIES[1], neighborhood="")]
    base = next((c for c in CITIES if c["city"] == city), CITIES[1])
    return [dict(base, neighborhood=n, locationId=base["locationId"] + ">" + n) for n in NEIGHBORHOODS if ql in n.lower()]


async def run(source: str, params: dict) -> dict:
    rnd = random.Random(hash((source, params["location"]["city"])) & 0xFFFF)
    await asyncio.sleep(0.6 + rnd.random() * 3)
    if source == "imovelweb":
        raise RuntimeError("O site bloqueou a consulta temporariamente. Tente de novo em alguns minutos.")
    buy = params["business"] == "buy"
    items = []
    shared = random.Random(7)  # imóveis que aparecem em vários portais
    for i in range(rnd.randint(18, 34)):
        r = shared if i < 6 else rnd
        beds = r.randint(1, 4)
        area = r.randint(38, 180)
        price = (r.randint(18, 120) * 10_000) if buy else (r.randint(12, 90) * 100)
        nb = params["location"].get("neighborhood") or r.choice(NEIGHBORHOODS)
        if r.random() < 0.25:
            nb = r.choice(NEIGHBORHOODS)
        seed = r.randint(0, 999)
        items.append({
            "id": f"{source}-{i}" if i >= 6 else f"shared-{i}",
            "title": f"{r.choice(['Apartamento', 'Casa', 'Cobertura', 'Studio'])} com {beds} quarto{'s' if beds > 1 else ''}, {area} m², "
                     f"{r.choice(['varanda gourmet', 'lazer completo', 'próximo ao metrô', 'reformado', 'vista livre'])}",
            "price": price,
            "condo": None if r.random() < 0.3 else r.randint(3, 15) * 100,
            "iptu": None if r.random() < 0.5 else r.randint(5, 40) * 10,
            "area": area,
            "bedrooms": beds,
            "bathrooms": r.randint(1, beds + 1),
            "parking": r.randint(0, 3),
            "neighborhood": nb,
            "city": params["location"]["city"],
            "address": f"{r.choice(STREETS)}, {r.randint(10, 2000)}",
            "image": None if r.random() < 0.08 else _img(seed),
            "url": f"https://example.com/{source}/{i}",
        })
    return {"items": items, "total": len(items) * rnd.randint(5, 40)}
