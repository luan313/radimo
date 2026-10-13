// Facebook Marketplace — extrai os cards da página de busca já carregada (a página é
// aberta e rolada pelo backend antes). Funciona deslogado (menos resultados) ou com a
// sessão temporária que o usuário abre pelo app.
async (p) => {
  const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const num = (s) => {
    const m = String(s ?? "").replace(/\./g, "").match(/\d+/);
    return m ? Number(m[0]) : null;
  };
  if (/login|checkpoint/.test(location.pathname)) throw new Error("O Facebook pediu login — conecte sua conta no app");

  const wantedNb = norm(p.location.neighborhood || "");
  const items = [];
  const seen = new Set();
  for (const a of document.querySelectorAll('a[href*="/marketplace/item/"]')) {
    const id = (a.getAttribute("href").match(/\/item\/(\d+)/) || [])[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const lines = a.innerText.split("\n").map((s) => s.trim()).filter(Boolean);
    const priceLine = lines.find((l) => /R\$\s?[\d.]+/.test(l)) || "";
    const rest = lines.filter((l) => l !== priceLine && !/R\$\s?[\d.]+/.test(l));
    const locLine = rest.find((l) => /,\s*[A-Z]{2}$/.test(l)) || "";
    const title = rest.find((l) => l !== locLine && !/^\d+\s?km/.test(l)) || "";
    if (/procuro|procura-se|compro\b/i.test(title)) continue; // pedidos, não ofertas
    const price = num(priceLine);
    if (!price || price < 100) continue; // "R$1" etc. = preço fictício
    const [cityName] = locLine.split(",").map((s) => s.trim());
    const img = a.querySelector("img")?.getAttribute("src") || null;
    items.push({
      id,
      title,
      price,
      condo: null,
      iptu: null,
      area: num((title.match(/(\d+)\s?m²/) || [])[1]),
      bedrooms: num((title.match(/(\d+)\s*(?:quartos?|dorm)/i) || [])[1]),
      bathrooms: num((title.match(/(\d+)\s*banheiros?/i) || [])[1]),
      parking: null,
      // O card só informa a cidade; se o título cita o bairro buscado, usamos.
      neighborhood: wantedNb && norm(title).includes(wantedNb) ? p.location.neighborhood : "",
      city: cityName || "",
      address: "",
      image: img,
      url: `https://www.facebook.com/marketplace/item/${id}/`,
    });
  }
  return { items, total: items.length };
}
