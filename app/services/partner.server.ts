// Looks up which of your partner brands owns a given Shopify store,
// and lets you register a new brand when they install the app.
import db from "../db.server";

export async function getPartnerByShop(shop: string) {
  return db.partnerBrand.findUnique({
    where: { shop },
  });
}

export async function createPartnerBrand(
  shop: string,
  brandName: string,
  contactEmail?: string
) {
  return db.partnerBrand.create({
    data: {
      shop,
      brandName,
      contactEmail,
    },
  });
}
