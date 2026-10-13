// MGF Imóveis — classificado nacional que agrega anúncios de proprietários e imobiliárias.
// URL: /aluguel/imoveis/go-goiania-jardim-guanabara?pricemin=&pricemax=&dorms=  (dorms = mínimo)
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
  let path = `/${kind}/imoveis/${uf}-${slugify(p.location.city)}`;
  if (p.location.neighborhood) path += `-${slugify(p.location.neighborhood)}`;

  const qs = new URLSearchParams();
  if (p.priceMin) qs.set("pricemin", String(p.priceMin));
  if (p.priceMax) qs.set("pricemax", String(p.priceMax));
  if (p.bedrooms) qs.set("dorms", String(p.bedrooms));

  const items = [];
  const seen = new Set();
  let total = 0;
  for (let page = 1; page <= p.pages; page++) {
    const q = new URLSearchParams(qs);
    if (page > 1) q.set("page", String(page));
    const url = path + (q.toString() ? "?" + q : "");
    const r = await fetch(url, { credentials: "include" });
    if (!r.ok) {
      if (page === 1) throw new Error("HTTP " + r.status);
      break;
    }
    if (page > 1 && r.redirected) break; // sem próxima página
    const doc = new DOMParser().parseFromString(await r.text(), "text/html");
    // "45 imóveis" aparece só quando há resultados; sem ele a página mostra apenas sugestões.
    const m = doc.body.textContent.match(/([\d.]+)\s+im[oó]veis\b/i);
    const count = m ? num(m[1]) : 0;
    if (page === 1) total = count;
    if (!count) break;

    const cards = [...doc.querySelectorAll('h3 a[href*="mgfimoveis.com.br"]')]
      .map((a) => a.closest("h3").parentElement)
      .slice(0, Math.max(0, count - items.length)); // o restante são sugestões de outros lugares
    if (!cards.length) break;
    for (const c of cards) {
      const a = c.querySelector("h3 a");
      const href = a.getAttribute("href");
      const id = (href.match(/-(\d+)(?:\?|$)/) || [])[1] || href;
      if (seen.has(id)) continue;
      seen.add(id);
      const spans = [...c.querySelectorAll("p span")].map((s) => s.textContent.trim());
      const sp = (re) => num(spans.find((s) => re.test(s)));
      const priceText = [...c.querySelectorAll("p")].map((x) => x.textContent).find((x) => /R\$/.test(x)) || "";
      const addr = (c.querySelector("address")?.textContent || "").trim(); // "Jardim Guanabara, Goiânia - GO"
      const [nb, rest] = addr.split(",").map((s) => s.trim());
      const cityName = (rest || "").split("-")[0].trim();
      const card = c.parentElement || c;
      const img = card.querySelector("picture img, img")?.getAttribute("src");
      items.push({
        id,
        title: (a.getAttribute("title") || a.textContent || "").trim(),
        price: num(priceText),
        condo: null,
        iptu: null,
        area: sp(/m²/),
        bedrooms: sp(/Dormit/i),
        bathrooms: sp(/Banheiro/i),
        parking: sp(/Vaga/i),
        neighborhood: rest ? nb : "",
        city: cityName || p.location.city,
        address: "",
        image: img && !img.startsWith("data:") ? img : null,
        url: href,
      });
    }
    if (items.length >= total) break;
  }
  return { items, total };
}
