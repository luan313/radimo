// Wimoveis — mesmo grupo e mesma plataforma do Imovelweb (forte em DF e GO).
// URL: /aluguel/imoveis/go/goiania/jardim-guanabara?pagina=N
async (p) => {
  const slugify = (s) =>
    (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const num = (s) => {
    const m = String(s ?? "").replace(/\./g, "").match(/\d+/);
    return m ? Number(m[0]) : null;
  };
  const kind = p.business === "buy" ? "venda" : "aluguel";
  const uf = (p.location.uf || "").toLowerCase();
  const city = slugify(p.location.city);
  const nb = p.location.neighborhood ? slugify(p.location.neighborhood) : "";
  const path = `/${kind}/imoveis/${uf}/${city}${nb ? "/" + nb : ""}`;
  const maxPages = p.priceMin || p.priceMax ? Math.max(p.pages + 2, 4) : p.pages;

  const items = [];
  const seen = new Set();
  let total = 0;
  for (let page = 1; page <= maxPages; page++) {
    const r = await fetch(path + (page > 1 ? `?pagina=${page}` : ""), { credentials: "include" });
    if (!r.ok) {
      if (page === 1) throw new Error("HTTP " + r.status);
      break;
    }
    // Bairro/cidade desconhecidos redirecionam para uma busca mais ampla.
    if (page === 1 && new URL(r.url).pathname.replace(/\/$/, "") !== path) {
      throw new Error("Localização não reconhecida pelo Wimoveis");
    }
    const doc = new DOMParser().parseFromString(await r.text(), "text/html");
    if (page === 1) {
      total = num((doc.title.match(/^\s*([\d.]+)/) || [])[1]) || 0;
      if (!total) break; // página só com sugestões
    }
    // Depois dos resultados, a página lista sugestões de outros bairros: respeita o total.
    const cards = [...doc.querySelectorAll('[data-qa^="posting "]')].slice(0, Math.max(0, total - items.length));
    if (!cards.length) break;
    for (const c of cards) {
      const id = c.getAttribute("data-id");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const q = (k) => c.querySelector(`[data-qa="${k}"]`);
      const feats = [...(q("POSTING_CARD_FEATURES")?.querySelectorAll("span") || [])].map((e) => e.textContent.trim());
      const feat = (re) => num(feats.find((f) => re.test(f)));
      const locEl = q("POSTING_CARD_LOCATION");
      const [nbName, cityName] = (locEl?.textContent || "").split(",").map((s) => s.trim());
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
        neighborhood: nbName || "",
        city: cityName || p.location.city,
        address: locEl?.previousElementSibling?.textContent?.trim() || "",
        image: img ? img.replace("/360x266/", "/720x532/") : null,
        url: "https://www.wimoveis.com.br" + link.split("?")[0],
      });
    }
    if (items.length >= total) break;
  }
  return { items, total };
}
