// 62imoveis.com — portal regional (GO, DF, TO e outros). HTML renderizado no servidor.
// Filtro de preço não existe na URL: ordenamos por valor e paramos quando passa do limite.
async (p) => {
  const slugify = (s) =>
    (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const num = (s) => {
    const m = String(s ?? "").replace(/\./g, "").replace(",", ".").match(/\d+(\.\d+)?/);
    return m ? Math.round(Number(m[0])) : null;
  };
  const title = (s) => (s || "").toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  const kind = p.business === "buy" ? "venda" : "aluguel";
  const uf = (p.location.uf || "").toLowerCase();
  const city = slugify(p.location.city);
  const nb = p.location.neighborhood ? slugify(p.location.neighborhood) : "";
  const base = `/${kind}/${uf}/${city}/${nb ? nb + "/" : ""}imoveis`;

  // Ordena pelo lado do filtro de preço para achar os compatíveis logo nas primeiras páginas.
  const order = p.priceMax ? "menor-valor" : p.priceMin ? "maior-valor" : "";
  const maxPages = p.priceMax || p.priceMin ? Math.max(p.pages + 2, 4) : p.pages;

  const items = [];
  const seen = new Set();
  let total = 0;
  for (let page = 1; page <= maxPages; page++) {
    const qs = new URLSearchParams();
    if (order) qs.set("ordenamento", order);
    if (page > 1) qs.set("pagina", String(page));
    const r = await fetch(base + (qs.toString() ? "?" + qs : ""), { credentials: "include" });
    if (!r.ok) {
      if (page === 1) throw new Error("HTTP " + r.status);
      break;
    }
    const doc = new DOMParser().parseFromString(await r.text(), "text/html");
    const t = doc.title || "";
    if (page === 1) {
      if (!slugify(t).includes(city.split("-")[0])) throw new Error("Cidade não atendida pelo 62imoveis");
      total = num((t.match(/^\s*([\d.]+)/) || [])[1]) || 0;
      if (!total) break; // "0 imóveis": a página mostra só sugestões
    }
    const cards = [...doc.querySelectorAll('a[itemprop="url"][href^="/imovel/"]')];
    if (!cards.length) break;
    let lastPrice = null;
    for (const a of cards) {
      const href = a.getAttribute("href");
      const id = (href.match(/-(\d+)$/) || [])[1] || href;
      if (seen.has(id)) continue;
      seen.add(id);
      const price = num(a.querySelector("[itemprop=price]")?.getAttribute("content"));
      const feats = [...a.querySelectorAll("div")].map((d) => d.textContent.trim()).filter((x) => x.length < 20);
      const feat = (re) => num(feats.find((f) => re.test(f)));
      const place = (a.querySelector("h2")?.textContent || "").split(",").map((s) => s.trim());
      const neighborhood = place.length >= 2 ? title(place[place.length - 2]) : "";
      const street = place.length >= 3 ? title(place.slice(0, place.length - 2).join(", ")) : "";
      const descs = [...a.querySelectorAll('[itemprop="description"]')].map((d) => d.textContent.trim());
      const img = a.querySelector("picture img")?.getAttribute("src");
      items.push({
        id,
        title: (descs.find((d) => d.length > 25) || descs[0] || "").slice(0, 160),
        price,
        condo: null,
        iptu: null,
        area: feat(/m²/),
        bedrooms: feat(/Quarto/i),
        bathrooms: feat(/Banheiro/i),
        parking: feat(/Vaga/i),
        neighborhood,
        city: p.location.city,
        address: street,
        image: img && !img.startsWith("data:") ? img : null,
        url: "https://www.62imoveis.com.br" + href,
      });
      if (price != null) lastPrice = price;
    }
    // A ordenação vale do meio da página em diante (destaques pagos vêm primeiro), então olhamos o último card.
    const stop =
      lastPrice != null &&
      ((order === "menor-valor" && lastPrice > p.priceMax) || (order === "maior-valor" && lastPrice < p.priceMin));
    if (stop || items.length >= total) break;
  }
  return { items, total };
}
