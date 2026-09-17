// Internal endpoint, only called by the existing backend (the-deft-crew),
// never by Shopify or a browser. Lets Express say "create this code on
// this shop" without Express ever needing its own Shopify credentials,
// the Remix app already holds the login for every installed store.
import type { ActionFunctionArgs } from "@remix-run/node";
import { unauthenticated } from "../shopify.server";
import { createShopifyDiscount } from "../services/discount.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.SHOPIFY_APP_API_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await request.json().catch(() => null);
  const { shop, code, discountType, discountValue, expiresAt } = body || {};

  if (!shop || !code || !discountType || !discountValue || !expiresAt) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Uses the offline login this shop already has stored, from when
    // they installed the app, no active browser session needed.
    const { admin } = await unauthenticated.admin(shop);

    const discount = await createShopifyDiscount(admin, {
      code,
      discountType,
      discountValue,
      startsAt: new Date().toISOString(),
      endsAt: expiresAt,
      usageLimit: 1,
    });

    return new Response(
      JSON.stringify({ success: true, shopifyDiscountId: discount.id }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error(`Internal create-discount failed for ${shop}:`, err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};