// Sites de imobiliárias feitos na plataforma Arbo (ex.: Marco Imobiliária).
// A API devolve o catálogo inteiro da imobiliária (poucas centenas de imóveis);
// o backend filtra cidade, bairro, preço e quartos depois.
async (p) => {
  const API = "https://api-site.arboimoveis.com.br/api/";
  const ser = (o) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(o)) {
      if (Array.isArray(v)) v.forEach((x) => q.append(k + "[]", typeof x === "object" ? JSON.stringify(x) : x));
      else if (v && typeof v === "object") q.append(k, JSON.stringify(v));
      else if (v !== undefined && v !== null) q.append(k, v);
    }
    return q.toString();
  };
  const buy = p.business === "buy";
  const tipovar = buy ? "a-venda" : "para-alugar";
  const filters = {
    mobilia: "talvez", tipoimovel: {}, tipovar, order: "mais_relevantes",
    precovenda: [], precolocacao: [], area: [], dormitorios: [], suites: [], banheiros: [],
    imb_id: [], vagas: [], conveniences: [], finalidade: [], propertySubtypes: [],
    hasTypeSearch: true, limit_imv: 3000,
    // Caixa que cobre o Brasil inteiro (é o que o próprio site usa quando não há mapa).
    center: { lat: -14.235004, lng: -51.92528 },
    north_east: { lat: -33.751279, lng: -73.982661 },
    south_west: { lat: 5.2716701, lng: -32.388698 },
  };
  const r = await fetch(API + "imoveis-replica/find-by-polygon-new?" + ser(filters));
  if (!r.ok) throw new Error("HTTP " + r.status);
  const found = await r.json();
  const ids = (found.data || []).map((x) => x.id);

  const items = [];
  for (let i = 0; i < ids.length; i += 60) {
    const batch = ids.slice(i, i + 60);
    const q = new URLSearchParams({ where: JSON.stringify({ id: { inq: batch } }), tipovar });
    const d = await fetch(API + "imoveis-replica/get-imoveis-new?" + q);
    if (!d.ok) break;
    for (const x of await d.json()) {
      const foto = (x.fotos || [])[0] || {};
      items.push({
        id: String(x.id),
        title: (x.imv_titulo || "").replace(/^Pasta [\d.]+\s*-\s*/i, ""),
        price: buy ? x.imv_preco_venda : x.imv_preco_locacao,
        condo: x.imv_preco_cond || null,
        iptu: x.imv_preco_iptu || null,
        area: x.imv_area_util || x.imv_area_total || null,
        bedrooms: x.imv_qtd_dorm ?? null,
        bathrooms: x.imv_qtd_banheiros ?? null,
        parking: x.imv_qtd_vagas ?? null,
        neighborhood: x.imv_bairro || "",
        city: x.imv_cidade || "",
        address: x.imv_hide_address_wl ? "" : x.imv_endereco || "",
        image: foto.thumbnail || foto.imvft_watermark || foto.imvft_url || null,
        url: x.url_amiga || location.origin,
      });
    }
  }
  return { items, total: found.count || items.length };
}
