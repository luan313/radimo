// Chaves na Mão — parse do HTML da listagem (SSR em streaming).
// Preço vem do próprio link do anúncio ("...-RS499000/id-..."), que é sempre renderizado.
async (p) => {
  const slugify = (s) =>
    (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const num = (s) => {
    const m = String(s ?? "").replace(/\./g, "").match(/\d+/);
    return m ? Number(m[0]) : null;
  };
  const kind = p.business === "buy" ? "imoveis-a-venda" : "imoveis-para-alugar";
  const uf = (p.location.uf || "").toLowerCase();
  let base = `/${kind}/${uf}-${slugify(p.location.city)}/`;
  if (p.location.neighborhood) base += `${slugify(p.location.neighborhood)}/`;

  const filtro = [];
  if (p.priceMin) filtro.push(`pmin:${p.priceMin}`);
  if (p.priceMax) filtro.push(`pmax:${p.priceMax}`);

  // O site só filtra quartos exatos ("2-quartos/"); para "N ou mais" buscamos N, N+1 e N+2.
  const roomsList = p.bedrooms ? [p.bedrooms, p.bedrooms + 1, p.bedrooms + 2].filter((n) => n <= 5) : [null];

  const items = [];
  const seen = new Set();
  let total = 0;
  for (const rooms of roomsList) {
    for (let page = 1; page <= p.pages; page++) {
      const qs = new URLSearchParams();
      if (filtro.length) qs.set("filtro", filtro.join(","));
      if (page > 1) qs.set("pg", String(page));
      const path = base + (rooms ? `${rooms}-quartos/` : "") + (qs.toString() ? `?${decodeURIComponent(qs.toString())}` : "");
      const r = await fetch(path, { credentials: "include" });
      if (!r.ok) {
        if (page === 1 && rooms === roomsList[0]) throw new Error("HTTP " + r.status);
        break;
      }
      const html = await r.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      // Muitas fotos só chegam via JS; o ld+json da página traz a capa de cada anúncio.
      const imgFor = (id) => {
        const m = html.match(new RegExp(`https://www\\.chavesnamao\\.com\\.br/imn/[^"\\\\]*?/${id}/[^"\\\\]*?\\.(?:jpg|jpeg|png|webp)`));
        return m ? m[0] : null;
      };
      if (/não encontrada/i.test(doc.title)) {
        if (rooms === roomsList[0] && page === 1) throw new Error("Localização não reconhecida pelo Chaves na Mão");
        break;
      }
      if (page === 1) {
        const ld = [...doc.querySelectorAll('script[type="application/ld+json"]')]
          .map((s) => { try { return JSON.parse(s.textContent); } catch (e) { return null; } })
          .find((j) => j && j.offers && j.offers.numberOfItems);
        total += ld ? ld.offers.numberOfItems : 0;
      }
      // Um mesmo anúncio pode ter mais de um <a>; fica com o que tem o conteúdo do card.
      const byId = new Map();
      const imgs = new Map();
      for (const a of doc.querySelectorAll('a[href*="/imovel/"]')) {
        const id = (a.getAttribute("href").match(/id-(\d+)/) || [])[1];
        if (!id) continue;
        const im = a.querySelector("img")?.getAttribute("src");
        if (im && !imgs.has(id)) imgs.set(id, im);
        const prev = byId.get(id);
        if (!prev || (!prev.querySelector("h2") && a.querySelector("h2"))) byId.set(id, a);
      }
      if (!byId.size) break;
      let added = 0;
      for (const [id, a] of byId) {
        if (seen.has(id)) continue;
        seen.add(id);
        const href = a.getAttribute("href");
        const lab = (re) => {
          const el = [...a.querySelectorAll("[aria-label]")].find((e) => re.test(e.getAttribute("aria-label")));
          return el ? num(el.getAttribute("aria-label")) : null;
        };
        const addr = [...a.querySelectorAll("address p")].map((e) => e.textContent.trim());
        const [nb, cityUf] = (addr[1] || "").split(",").map((s) => s.trim());
        const priceFromUrl = num((href.match(/-RS(\d+)/) || [])[1]);
        const priceFromCard = num(a.querySelector('[aria-label="Preço"] b')?.textContent);
        const condoEl = a.querySelector('[aria-label="Condominio"] span');
        const slugBeds = num((href.match(/-(\d+)-quartos?-/) || [])[1]);
        const slugArea = num((href.match(/-(\d+)m2-/) || [])[1]);
        const slugTitle = (href.split("/")[2] || "").replace(/-RS\d+$/, "").replace(/-/g, " ");
        items.push({
          id,
          title: (a.querySelector("h2")?.textContent || a.getAttribute("title") || slugTitle).trim(),
          price: priceFromCard || priceFromUrl,
          condo: condoEl ? num(condoEl.textContent) : null,
          iptu: null,
          area: lab(/Área/) ?? slugArea,
          bedrooms: lab(/Quarto/) ?? slugBeds,
          bathrooms: lab(/Banheiro/),
          parking: lab(/Garage/),
          neighborhood: nb || p.location.neighborhood || "",
          city: (cityUf || "").split("/")[0] || p.location.city,
          address: addr[0] || "",
          image: imgs.get(id) || imgFor(id),
          url: "https://www.chavesnamao.com.br" + href,
        });
        added++;
      }
      if (!added) break;
    }
  }
  return { items, total };
}
