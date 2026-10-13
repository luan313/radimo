// ZAP Imóveis / Viva Real — ambos usam a API "glue" do Grupo OLX.
// Executado dentro de uma aba do portal (mesma origem/cookies), via page.evaluate.
async (p) => {
  const portal = p.portal; // "ZAP" | "VIVAREAL"
  const site = portal === "ZAP" ? "https://www.zapimoveis.com.br" : "https://www.vivareal.com.br";
  const domain = portal === "ZAP" ? ".zapimoveis.com.br" : ".vivareal.com.br";
  const business = p.business === "buy" ? "SALE" : "RENTAL";
  const PAGE = 30; // limite da API

  const fields = [
    "search(result(listings(listing(id,title,pricingInfos,bedrooms,bathrooms,parkingSpaces,",
    "usableAreas,address(city,neighborhood,street,streetNumber,zone,stateAcronym),unitTypes),medias)),totalCount)",
  ].join("");

  const qs = new URLSearchParams({
    business,
    listingType: "USED",
    portal,
    categoryPage: "RESULT",
    addressCity: p.location.city,
    addressState: p.location.state,
    size: String(PAGE),
    includeFields: fields,
  });
  if (p.location.locationIds && p.location.locationIds.length) {
    // vários bairros numa chamada só
    qs.set("addressLocationId", p.location.locationIds.join(","));
    qs.set("addressNeighborhood", p.location.neighborhoodNames.join(","));
  } else {
    qs.set("addressLocationId", p.location.locationId);
    if (p.location.neighborhood) qs.set("addressNeighborhood", p.location.neighborhood);
    if (p.location.zone) qs.set("addressZone", p.location.zone);
  }
  if (p.priceMin) qs.set("priceMin", String(p.priceMin));
  if (p.priceMax) qs.set("priceMax", String(p.priceMax));
  if (p.bedrooms) {
    const b = [];
    for (let i = p.bedrooms; i <= 5; i++) b.push(i);
    qs.set("bedrooms", b.join(","));
  }

  const items = [];
  let total = 0;
  for (let page = 0; page < p.pages; page++) {
    qs.set("from", String(page * PAGE));
    const r = await fetch("https://glue-api.zapimoveis.com.br/v4/listings?" + qs.toString(), {
      headers: { "x-domain": domain },
      credentials: "omit",
    });
    if (!r.ok) {
      if (page === 0) throw new Error("HTTP " + r.status);
      break;
    }
    const j = await r.json();
    total = j?.search?.totalCount || total;
    const list = j?.search?.result?.listings || [];
    for (const it of list) {
      const L = it.listing || {};
      const pi = (L.pricingInfos || []).find((x) => x.businessType === business) || {};
      const media = (it.medias || []).find((m) => m.type === "IMAGE");
      const img = media
        ? media.url
            .replace("{description}", "imovel")
            .replace("{action}", "fit-in")
            .replace("{width}x{height}", "640x420")
        : null;
      const a = L.address || {};
      items.push({
        id: String(L.id),
        title: L.title || "",
        price: pi.price ? Number(pi.price) : null,
        condo: pi.monthlyCondoFee ? Number(pi.monthlyCondoFee) : null,
        iptu: pi.iptu ? Number(pi.iptu) : null,
        area: L.usableAreas?.[0] ? Number(L.usableAreas[0]) : null,
        bedrooms: L.bedrooms?.[0] ?? null,
        bathrooms: L.bathrooms?.[0] ?? null,
        parking: L.parkingSpaces?.[0] ?? null,
        neighborhood: a.neighborhood || "",
        city: a.city || "",
        address: [a.street, a.streetNumber].filter(Boolean).join(", "),
        image: img,
        url: `${site}/imovel/id-${L.id}/`,
      });
    }
    if (list.length < PAGE) break;
  }
  return { items, total };
}
