// Autocomplete de cidades/bairros usando a API de localizações do ZAP.
// Retorna itens normalizados com cidade, estado, UF, bairro, zona e locationId.
async (p) => {
  const UF = {
    "Acre": "AC", "Alagoas": "AL", "Amapá": "AP", "Amazonas": "AM", "Bahia": "BA", "Ceará": "CE",
    "Distrito Federal": "DF", "Espírito Santo": "ES", "Goiás": "GO", "Maranhão": "MA",
    "Mato Grosso": "MT", "Mato Grosso do Sul": "MS", "Minas Gerais": "MG", "Pará": "PA",
    "Paraíba": "PB", "Paraná": "PR", "Pernambuco": "PE", "Piauí": "PI", "Rio de Janeiro": "RJ",
    "Rio Grande do Norte": "RN", "Rio Grande do Sul": "RS", "Rondônia": "RO", "Roraima": "RR",
    "Santa Catarina": "SC", "São Paulo": "SP", "Sergipe": "SE", "Tocantins": "TO",
  };
  const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const isNb = p.kind === "neighborhood";

  const query = async (q) => {
    const qs = new URLSearchParams({
      portal: "ZAP",
      fields: isNb ? "neighborhood" : "city",
      includeFields: "address.neighborhood,address.city,address.state,address.zone,address.locationId",
      size: isNb ? "50" : "8",
      q,
      listingType: "USED",
      businessType: p.business === "buy" ? "SALE" : "RENTAL",
    });
    const r = await fetch("https://glue-api.zapimoveis.com.br/v4/locations?" + qs, {
      headers: { "x-domain": ".zapimoveis.com.br" },
      credentials: "omit",
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    return Array.isArray(j.result) ? j.result : [];
  };

  // Para bairros, a API às vezes falha quando juntamos texto parcial + cidade ("asa b Goiânia")
  // e às vezes precisa da cidade para achar ("jardim guanabara goiania"). Fazemos as duas e juntamos.
  const queries = isNb && p.city ? [p.q, `${p.q} ${p.city}`] : [p.q];
  const results = (await Promise.allSettled(queries.map(query)))
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []));

  const out = [];
  const seen = new Set();
  for (const it of results) {
    const a = it.address || {};
    if (!a.city) continue;
    if (isNb && !a.neighborhood) continue;
    if (isNb && p.city && norm(a.city) !== norm(p.city)) continue;
    const key = norm(a.locationId || `${a.city}|${a.neighborhood}`);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      city: a.city,
      state: a.state,
      uf: UF[a.state] || "",
      neighborhood: a.neighborhood || "",
      zone: a.zone || "",
      locationId: a.locationId || "",
    });
  }
  // Quem começa com o texto digitado aparece primeiro.
  const q = norm(p.q);
  const score = (l) => {
    const n = norm(isNb ? l.neighborhood : l.city);
    return n.startsWith(q) ? 0 : n.split(/\s+/).some((w) => w.startsWith(q.split(/\s+/)[0])) ? 1 : 2;
  };
  out.sort((a, b) => score(a) - score(b));
  return out.slice(0, isNb ? 25 : 8);
}
