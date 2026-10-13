// Imovelweb — parse do HTML da listagem. A URL aceita bairro/cidade e quartos;
// o filtro de preço não é exposto na URL, então o backend filtra depois
// e aqui buscamos algumas páginas a mais.
async (p) => {
  const slugify = (s) =>
    (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const num = (s) => {
    const m = String(s ?? "").replace(/\./g, "").match(/\d+/);
    return m ? Number(m[0]) : null;
  };
  const kind = p.business === "buy" ? "venda" : "aluguel";
  const city = slugify(p.location.city);
  const uf = (p.location.uf || "").toLowerCase();
  const where = p.location.neighborhood ? `${slugify(p.location.neighborhood)}-${city}` : `${city}-${uf}`;
  const rooms = p.bedrooms ? `-mais-de-${p.bedrooms}-quartos` : "";
  const hasPrice = !!(p.priceMin || p.priceMax);
  const maxPages = hasPrice ? Math.max(p.pages + 2, 4) : p.pages;

  const items = [];
  const seen = new Set();
  let total = 0;
  for (let page = 1; page <= maxPages; page++) {
    const path = `/imoveis-${kind}-${where}${rooms}${page > 1 ? `-pagina-${page}` : ""}.html`;
    const r = await fetch(path, { credentials: "include" });
    if (!r.ok) {
      if (page === 1) throw new Error("HTTP " + r.status);
      break;
    }
    // Se o site redirecionou para uma busca genérica, o bairro/cidade não foi reconhecido.
    if (page === 1 && !new URL(r.url).pathname.includes(where)) {
      throw new Error("Localização não reconhecida pelo Imovelweb");
    }
    const doc = new DOMParser().parseFromString(await r.text(), "text/html");
    if (page === 1) {
      total = num((doc.title.match(/^\s*([\d.]+)/) || [])[1]) || 0;
      if (!total) break; // "0 imóveis": a página mostra só sugestões de outros bairros
    }
    // Depois dos resultados vêm sugestões de outros lugares: respeita o total anunciado.
    const cards = [...doc.querySelectorAll('[data-qa^="posting "]')].slice(0, Math.max(0, total - items.length));
    if (!cards.length) break;
    let added = 0;
    for (const c of cards) {
      const id = c.getAttribute("data-id");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const q = (k) => c.querySelector(`[data-qa="${k}"]`);
      const feats = [...(q("POSTING_CARD_FEATURES")?.querySelectorAll("span") || [])].map((e) => e.textContent.trim());
      const feat = (re) => num(feats.find((f) => re.test(f)));
      const locEl = q("POSTING_CARD_LOCATION");
      const [nb, cityName] = (locEl?.textContent || "").split(",").map((s) => s.trim());
      const street = locEl?.previousElementSibling?.textContent?.trim() || "";
      const img = [...c.querySelectorAll("img")]
        .map((i) => i.getAttribute("src") || i.getAttribute("data-src") || "")
        .find((s) => /\/avisos\//.test(s));
      const expensas = q("expensas")?.textContent || "";
      const link = c.getAttribute("data-to-posting") || "";
      items.push({
        id,
        title: (q("POSTING_CARD_DESCRIPTION")?.textContent || "").trim().slice(0, 140),
        price: num(q("POSTING_CARD_PRICE")?.textContent),
        condo: /condom/i.test(expensas) ? num(expensas) : null,
        iptu: null,
        area: feat(/m²/),
        bedrooms: feat(/quarto/),
        bathrooms: feat(/ban/),
        parking: feat(/vaga/),
        neighborhood: nb || "",
        city: cityName || p.location.city,
        address: street,
        image: img ? img.replace("/360x266/", "/720x532/") : null,
        url: "https://www.imovelweb.com.br" + link.split("?")[0],
      });
      added++;
    }
    if (!added) break;
  }
  return { items, total };
}
