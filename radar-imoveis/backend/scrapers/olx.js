// OLX — busca por estado + texto (bairro/cidade).
// Lê a lista "ads" embutida no payload RSC do Next.js; cai para o HTML dos cards se falhar.
async (p) => {
  const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const num = (s) => {
    const m = String(s ?? "").replace(/\./g, "").match(/\d+/);
    return m ? Number(m[0]) : null;
  };
  const kind = p.business === "buy" ? "venda" : "aluguel";
  const uf = (p.location.uf || "").toLowerCase();
  const base = `https://www.olx.com.br/imoveis/${kind}/estado-${uf}`;
  const q = [p.location.neighborhood, p.location.city].filter(Boolean).join(" ");

  const fromFlight = (html) => {
    let flight = "";
    const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
    let m;
    while ((m = re.exec(html))) {
      try { flight += JSON.parse(m[1]); } catch (e) { /* ignora */ }
    }
    const i = flight.indexOf('"ads":[');
    if (i < 0) return null;
    let depth = 0, j = i + 6;
    for (; j < flight.length; j++) {
      const ch = flight[j];
      if (ch === "[") depth++;
      else if (ch === "]") { depth--; if (depth === 0) break; }
    }
    try {
      const ads = JSON.parse(flight.slice(i + 6, j + 1));
      return ads.filter((a) => a && a.url && a.subject).map((a) => {
        const prop = (n) => (a.properties || []).find((x) => x.name === n)?.value;
        const ld = a.locationDetails || {};
        const img = a.images?.[0]?.original || null;
        return {
          id: String(a.listId),
          title: a.subject,
          price: num(a.price || a.priceValue),
          condo: num(prop("condominio")),
          iptu: num(prop("iptu")),
          area: num(prop("size")),
          bedrooms: num(prop("rooms")),
          bathrooms: num(prop("bathrooms")),
          parking: num(prop("garage_spaces")),
          neighborhood: ld.neighbourhood || "",
          city: ld.municipality || "",
          address: "",
          image: img,
          url: a.url,
        };
      });
    } catch (e) {
      return null;
    }
  };

  const fromCards = (doc) =>
    [...doc.querySelectorAll("section.olx-adcard")].map((c) => {
      const a = c.querySelector('a[data-testid="adcard-link"]');
      const href = a?.getAttribute("href") || "";
      if (!href || href === "#") return null;
      const label = (re) => {
        const el = [...c.querySelectorAll("[aria-label]")].find((e) => re.test(e.getAttribute("aria-label")));
        return el ? num(el.getAttribute("aria-label")) : null;
      };
      const infos = [...c.querySelectorAll('[data-testid="adcard-price-info"]')].map((e) => e.textContent);
      const locP = [...c.querySelectorAll("p")].map((e) => e.textContent.trim()).find((t) => /,/.test(t) && !/R\$/.test(t)) || "";
      const [city, nb] = locP.split(",").map((s) => s.trim());
      return {
        id: (href.match(/(\d{6,})(?:\?|$)/) || [])[1] || href,
        title: (c.querySelector("h2")?.textContent || "").trim(),
        price: num(c.querySelector("h3")?.textContent),
        condo: num(infos.find((t) => /Condom/i.test(t))),
        iptu: num(infos.find((t) => /IPTU/i.test(t))),
        area: label(/metros quadrados/),
        bedrooms: label(/quarto/),
        bathrooms: label(/banheiro/),
        parking: label(/vaga/),
        neighborhood: nb || "",
        city: city || "",
        address: "",
        image: c.querySelector("picture source[type='image/jpeg']")?.getAttribute("srcset") || null,
        url: href,
      };
    }).filter(Boolean);

  const items = [];
  const seen = new Set();
  let total = 0;
  for (let page = 1; page <= p.pages; page++) {
    const qs = new URLSearchParams({ q });
    if (p.priceMin) qs.set("ps", String(p.priceMin));
    if (p.priceMax) qs.set("pe", String(p.priceMax));
    if (p.bedrooms) qs.set("ros", String(p.bedrooms));
    if (page > 1) qs.set("o", String(page));
    const r = await fetch(`${base}?${qs}`, { credentials: "include" });
    if (!r.ok) {
      if (page === 1) throw new Error("HTTP " + r.status);
      break;
    }
    const html = await r.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    if (page === 1) {
      const t = doc.body.textContent.match(/de\s+([\d.]+)\s+resultados/);
      total = t ? num(t[1]) : 0;
    }
    const list = fromFlight(html) || fromCards(doc);
    if (!list.length) break;
    for (const it of list) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      // A busca por texto pode trazer outras cidades: mantém só a cidade escolhida.
      if (it.city && norm(it.city) !== norm(p.location.city)) continue;
      items.push(it);
    }
  }
  return { items, total };
}
