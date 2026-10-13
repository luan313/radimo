// QuintoAndar — API de busca usada pelo próprio site (house-listing-search v3).
async (p) => {
  const slugify = (s) =>
    (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const uf = (p.location.uf || "").toLowerCase();
  const citySlug = `${slugify(p.location.city)}-${uf}-brasil`;
  const nbSlug = p.location.neighborhood ? `${slugify(p.location.neighborhood)}-${citySlug}` : null;
  const buy = p.business === "buy";
  const PAGE = 48;

  const fields = [
    "id", "coverImage", "rent", "totalCost", "salePrice", "iptuPlusCondominium", "area", "address",
    "regionName", "city", "type", "forRent", "forSale", "bedrooms", "parkingSpaces", "bathrooms",
    "neighbourhood", "shortRentDescription", "shortSaleDescription", "developmentName",
    "minPrice", "minArea", "minBedrooms",
  ];

  const priceRange = [];
  if (p.priceMin || p.priceMax) {
    const range = {};
    if (buy) {
      if (p.priceMin) range.min = p.priceMin;
      if (p.priceMax) range.max = p.priceMax;
      priceRange.push({ costType: "SALE_PRICE", range });
    } else {
      // O QuintoAndar filtra por custo total (aluguel + taxas); usamos uma margem e
      // depois o backend refiltra pelo valor do aluguel.
      if (p.priceMax) range.max = Math.round(p.priceMax * 1.6);
      priceRange.push({ costType: "TOTAL_COST", range });
    }
  }

  const search = async (slug, offset) => {
    const body = {
      slug,
      topics: [],
      fields,
      sorting: { criteria: "RELEVANCE", order: "DESC" },
      pagination: { pageSize: PAGE, offset },
      context: { listShowing: true, mapShowing: false, numPhotos: 1, isSSR: false },
      filters: {
        businessContext: buy ? "SALE" : "RENT",
        location: { coordinate: {}, viewport: {}, neighborhoods: [], countryCode: "BR" },
        priceRange,
        houseSpecs: p.bedrooms ? { bedrooms: { range: { min: p.bedrooms } } } : {},
        availability: "ANY",
        occupancy: "ANY",
      },
      locationDescriptions: [{ description: slug }],
    };
    const r = await fetch("https://apigw.prod.quintoandar.com.br/house-listing-search/v3/search/list", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  };

  let slug = nbSlug || citySlug;
  let first;
  try {
    first = await search(slug, 0);
  } catch (e) {
    if (!nbSlug) throw e;
    slug = citySlug; // bairro não reconhecido: busca na cidade e filtra depois
    first = await search(slug, 0);
  }

  const pages = [first];
  for (let i = 1; i < p.pages; i++) {
    if ((first.hits?.hits || []).length < PAGE) break;
    try { pages.push(await search(slug, i * PAGE)); } catch (e) { break; }
  }

  const items = [];
  for (const j of pages) {
    for (const h of j.hits?.hits || []) {
      const s = h._source || {};
      const isDev = h.origin === "DEVELOPMENT";
      const price = buy ? (s.salePrice || s.minPrice || null) : (s.rent || null);
      items.push({
        id: String(s.id || h._id),
        title: s.developmentName
          ? s.developmentName
          : (buy ? s.shortSaleDescription : s.shortRentDescription) ||
            `${s.type || "Imóvel"} em ${s.neighbourhood || s.regionName || ""}`,
        price,
        condo: !buy && s.iptuPlusCondominium ? s.iptuPlusCondominium : null,
        iptu: null,
        area: s.area || s.minArea || null,
        bedrooms: s.bedrooms ?? s.minBedrooms ?? null,
        bathrooms: s.bathrooms ?? null,
        parking: s.parkingSpaces ?? null,
        neighborhood: s.neighbourhood || s.regionName || "",
        city: s.city || "",
        address: s.address || "",
        image: s.coverImage ? `https://www.quintoandar.com.br/img/med/${s.coverImage}` : null,
        url: `https://www.quintoandar.com.br/imovel/${s.id || h._id}/${buy ? "comprar" : "alugar"}`,
        tag: isDev ? "Lançamento" : null,
      });
    }
  }
  const t = first.hits?.total;
  return { items, total: typeof t === "object" ? t.value : t || items.length };
}
