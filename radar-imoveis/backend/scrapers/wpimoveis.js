// Sites de imobiliárias em WordPress que expõem os imóveis na API REST (ex.: Federal Imóveis).
// O catálogo é pequeno (centenas), então baixamos tudo e o backend filtra.
async (p) => {
  const buy = p.business === "buy";
  const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const num = (v) => {
    const n = Number(String(v ?? "").replace(/[^\d,.]/g, "").replace(/\.(?=\d{3})/g, "").replace(",", "."));
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  };
  // O site não informa a cidade; deduzimos pelo texto (padrão: Goiânia).
  const CITIES = ["Aparecida de Goiânia", "Senador Canedo", "Trindade", "Goianira", "Anápolis", "Nerópolis"];
  const cityOf = (text) => CITIES.find((c) => norm(text).includes(norm(c))) || "Goiânia";

  const all = [];
  for (let page = 1; page <= 10; page++) {
    const r = await fetch(`/wp-json/wp/v2/imoveis?per_page=100&page=${page}&_fields=id,link,title,meta`);
    if (!r.ok) {
      if (page === 1) throw new Error("HTTP " + r.status);
      break;
    }
    const list = await r.json();
    all.push(...list);
    const pages = Number(r.headers.get("x-wp-totalpages") || 1);
    if (page >= pages || !list.length) break;
  }

  const items = [];
  for (const x of all) {
    const m = x.meta || {};
    const fin = norm(m.finalidade);
    const price = buy ? num(m.valor_venda) : num(m.valor_aluguel);
    if (buy ? !(fin.includes("venda") || price) : !(fin.includes("alug") || fin.includes("loca") || price)) continue;
    if (!price) continue;
    const title = (x.title?.rendered || "").replace(/&#8211;/g, "–").replace(/&amp;/g, "&");
    items.push({
      id: String(x.id),
      title: [m.categoria, title].filter(Boolean).join(" · "),
      price,
      condo: num(m.valor_condominio),
      iptu: num(m.valor_iptu),
      area: num(m.area_privativa) || num(m.area_total),
      bedrooms: num(m.qtd_quartos),
      bathrooms: num(m.qtd_banheiro),
      parking: num(m.qtd_vagas),
      neighborhood: m.end_bairro || "",
      city: cityOf(title + " " + (x.link || "")),
      address: m.endereco || "",
      image: (m.fotos || [])[0]?.url || null,
      url: x.link,
    });
  }
  return { items, total: items.length };
}
