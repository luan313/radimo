// Mercado Livre Imóveis — extrai os cards da página de listagem já carregada.
// O Mercado Livre bloqueia navegadores "novos"/automatizados com uma tela de login
// (account-verification). Nesse caso o app pede para conectar a conta (menu Contas).
// Layout validado em 28/09/2026 (cards "poly-card").
async (p) => {
  const num = (s) => {
    const m = String(s ?? "").replace(/\./g, "").match(/\d+/);
    return m ? Number(m[0]) : null;
  };
  const STATES = new Set(["Acre", "Alagoas", "Amapá", "Amazonas", "Bahia", "Ceará", "Distrito Federal", "Espírito Santo",
    "Goiás", "Maranhão", "Mato Grosso", "Mato Grosso do Sul", "Minas Gerais", "Pará", "Paraíba", "Paraná", "Pernambuco",
    "Piauí", "Rio de Janeiro", "Rio Grande do Norte", "Rio Grande do Sul", "Rondônia", "Roraima", "Santa Catarina",
    "São Paulo", "Sergipe", "Tocantins"]);
  const txt = document.body.innerText || "";
  if (/account-verification|\/login/.test(location.href) || /Para continuar, acesse/i.test(txt)) {
    throw new Error("LOGIN_REQUIRED: o Mercado Livre exige login para buscas automáticas — conecte a conta no menu Contas");
  }
  const cards = [...document.querySelectorAll("li.ui-search-layout__item, .poly-card, .ui-search-result__wrapper")];
  const items = [];
  const seen = new Set();
  for (const c of cards) {
    const a =
      c.querySelector("a.poly-component__title, h2 a, a.ui-search-link, a[href*='MLB']") ||
      (c.tagName === "A" ? c : null);
    const href = a?.getAttribute("href") || "";
    const id = (href.match(/MLB-?(\d+)/i) || [])[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const attrs = [...c.querySelectorAll(".poly-attributes_list__item, .poly-attributes-list__item, .ui-search-card-attributes__attribute, li")]
      .map((e) => e.textContent.trim())
      .filter((t) => t.length < 40);
    const attr = (re) => num(attrs.find((t) => re.test(t)));
    const loc = (c.querySelector(".poly-component__location, .ui-search-item__location, .ui-search-item__group__element--location")?.textContent || "").trim();
    // Ex.: "Av. T-9, 3620 - Jardim América, Goiânia, Jardim América, Goiânia, Goiás"
    //  → último = estado, penúltimo = cidade, antepenúltimo = bairro
    const parts = loc.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length && STATES.has(parts[parts.length - 1])) parts.pop();
    const img = c.querySelector("img")?.getAttribute("src") || c.querySelector("img")?.getAttribute("data-src");
    items.push({
      id,
      title: [c.querySelector(".poly-component__headline")?.textContent, (a?.textContent || c.querySelector("h2, h3")?.textContent || "").trim()]
        .filter(Boolean)
        .join(" · "),
      price: num(c.querySelector(".andes-money-amount__fraction")?.textContent),
      condo: null,
      iptu: null,
      area: attr(/m²/),
      bedrooms: attr(/quarto|dormit/i),
      bathrooms: attr(/banheiro/i),
      parking: attr(/vaga/i),
      neighborhood: parts.length >= 2 ? parts[parts.length - 2] : "",
      city: parts.length ? parts[parts.length - 1] : "",
      address: parts.length >= 3 ? parts[0] : "",
      image: img && !img.startsWith("data:") ? img : null,
      url: href.split(/[?#]/)[0],
    });
  }
  return { items, total: items.length };
}
