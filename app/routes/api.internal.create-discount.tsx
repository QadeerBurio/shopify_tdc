// app/routes/api.internal.create-discount.tsx
//
// Internal endpoint, only called by the existing backend (the-deft-crew),
// never by Shopify or a browser. Lets Express say "create this code on
// this shop" without Express ever needing its own Shopify credentials —
// the Remix app already holds the offline login for every installed store.

import type { ActionFunctionArgs } from "@remix-run/node";
import { unauthenticated } from "../shopify.server";
import { createShopifyDiscount } from "../services/discount.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  // --- 1. Reject anything without the shared secret ---
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.SHOPIFY_APP_API_KEY) {
    console.warn("[internal/create-discount] Unauthorized — bad or missing x-api-key");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // --- 2. Parse + validate body ---
  const body = await request.json().catch(() => null);
  const { shop, code, discountType, discountValue, expiresAt } = body || {};

  if (!shop || !code || !discountType || !discountValue || !expiresAt) {
    console.warn("[internal/create-discount] Missing fields:", {
      shop: !!shop,
      code: !!code,
      discountType: !!discountType,
      discountValue: !!discountValue,
      expiresAt: !!expiresAt,
    });
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // --- 3. Normalize shop domain (defensive) ---
  const normalizedShop = String(shop)
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "")
    .toLowerCase()
    .trim();

  console.log(`[internal/create-discount] Creating ${code} on ${normalizedShop}`);

  try {
    // --- 4. Get the offline session that was stored when the store installed ---
    const { admin } = await unauthenticated.admin(normalizedShop);

    // --- 5. Create the discount via Shopify Admin GraphQL ---
    const discount = await createShopifyDiscount(admin, {
      code,
      discountType,
      discountValue,
      startsAt: new Date().toISOString(),
      endsAt: expiresAt,
      usageLimit: 1,
      appliesOncePerCustomer: true,
    });

    console.log(`[internal/create-discount] Success: ${discount.id}`);

    return new Response(
      JSON.stringify({ success: true, shopifyDiscountId: discount.id }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error(
      `[internal/create-discount] Failed for ${normalizedShop}:`,
      (err as Error).message
    );
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};