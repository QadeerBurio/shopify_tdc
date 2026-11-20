import { createHash } from "node:crypto";

// app/services/partner.server.ts
// ------------------------------------------------------------
// Client for the TDC backend. Every call is authenticated with
// X-API-KEY and has a hard timeout so a slow backend never hangs
// a Remix worker.
// ------------------------------------------------------------

const BACKEND_API_URL = process.env.BACKEND_API_URL;
const SHOPIFY_APP_API_KEY = process.env.SHOPIFY_APP_API_KEY;

if (!BACKEND_API_URL) {
  console.error(
    "[partner.server] ❌ BACKEND_API_URL is not set. All backend calls will fail."
  );
}
if (!SHOPIFY_APP_API_KEY) {
  console.error(
    "[partner.server] ❌ SHOPIFY_APP_API_KEY is not set. All backend calls will 401."
  );
}

// Default timeout for all backend calls (ms)
const BACKEND_TIMEOUT_MS = 15_000;

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------
export interface BackendDiscount {
  code: string;
  discountType: "percentage" | "fixed_amount";
  discountValue: number;
  isActive: boolean;
}

export interface BackendRoi {
  totalOrders: number;
  totalRevenue: number;
  totalDiscount: number;
  netRevenue: number;
  uniqueCustomers: number;
  avgOrderValue: number;
  periodStart: string;
  periodEnd: string;
}

export interface BackendBrand {
  id: string;
  brandName: string;
  shopifyStoreUrl: string;
  contactEmail?: string;
  roi: BackendRoi;
  discounts: BackendDiscount[];
}

// ------------------------------------------------------------
// Helper: fetch with timeout + friendly abort message
// ------------------------------------------------------------
async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = BACKEND_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    // AbortError from timeout — rethrow with a clear message
    if ((err as Error)?.name === "AbortError") {
      throw new Error(
        `Backend request timed out after ${timeoutMs}ms: ${init.method || "GET"} ${url}`
      );
    }
    // Network / DNS failure
    throw new Error(
      `Backend request failed (${(err as Error).message}): ${init.method || "GET"} ${url}`
    );
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------
// Internal helper: build the common headers
// ------------------------------------------------------------
function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "X-API-KEY": SHOPIFY_APP_API_KEY || "",
    ...extra,
  };
}

// ============================================================
// GET /api/shopify-app/brand?shop=...
// Used by the embedded dashboard loader.
// Returns null on 404 (brand not linked).
// Throws on other errors.
// ============================================================
export async function getPartnerByShop(
  shop: string
): Promise<BackendBrand | null> {
  const response = await fetchWithTimeout(
    `${BACKEND_API_URL}/api/shopify-app/brand?shop=${encodeURIComponent(shop)}`,
    { headers: authHeaders(), redirect: "error" }
  );

  if (response.status === 404) return null;

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Backend brand lookup failed: ${response.status} ${body.slice(0, 200)}`
    );
  }

  const brand = (await response.json()) as BackendBrand | null;
  if (!brand?.id || !brand.brandName || !brand.roi || !Array.isArray(brand.discounts)) {
    throw new Error("TDC brand response is incomplete");
  }
  return brand;
}

// ============================================================
// POST /api/shopify-app/discount
// Used when a merchant manually creates a discount in the embedded app.
// Requests are keyed by the shop and Shopify discount ID.
// ============================================================
export async function saveDiscountToBackend(input: {
  shop: string;
  brandId: string;
  code: string;
  discountType: "percentage" | "fixed_amount";
  discountValue: number;
  shopifyDiscountId: string;
  startsAt: string;
  endsAt?: string;
}): Promise<void> {
  const response = await fetchWithTimeout(
    `${BACKEND_API_URL}/api/shopify-app/discount`,
    {
      method: "POST",
      headers: authHeaders({
        "Content-Type": "application/json",
        "Idempotency-Key": createHash("sha256")
          .update(JSON.stringify([input.shop, input.shopifyDiscountId]))
          .digest("hex"),
      }),
      redirect: "error",
      body: JSON.stringify(input),
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Backend discount save failed: ${response.status} ${body.slice(0, 200)}`
    );
  }
}

// The TDC service owns sign-in, brand permissions, and the durable shop link.
export async function startBrandConnection(shop: string): Promise<string | null> {
  if (await getPartnerByShop(shop)) return null;
  const backend = new URL(BACKEND_API_URL || "");
  const allowedOrigin = new URL(process.env.TDC_CONNECT_ORIGIN || backend.origin);
  if (backend.protocol !== "https:" || allowedOrigin.protocol !== "https:" || !SHOPIFY_APP_API_KEY) {
    throw new Error("TDC connection is not configured");
  }

  const response = await fetchWithTimeout(
    new URL("/api/shopify-app/link-shop/start", backend).href,
    {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ shop }),
      redirect: "error",
    }
  );
  if (!response.ok) throw new Error(`TDC connection start failed: ${response.status}`);

  const { authorizationUrl } = await response.json();
  const url = new URL(authorizationUrl);
  if (url.origin !== allowedOrigin.origin || url.username || url.password) {
    throw new Error("Unexpected TDC authorization URL");
  }

  return url.href;
}

// ============================================================
// POST /api/shopify-app/order-webhook
// Forwards a Shopify order to the backend so PromoCodes can be
// marked used and Offer.redemptions can be recorded.
//
// Idempotency: we forward Shopify's webhook id so the backend
// can dedupe retries of the same event.
//
// Throws on failure so the caller can return 500 to Shopify,
// triggering a retry.
// ============================================================
export async function forwardOrderToBackend(input: {
  shop: string;
  order: unknown;
  topic?: string;
  webhookId?: string;
}): Promise<void> {
  const headers: Record<string, string> = authHeaders({
    "Content-Type": "application/json",
  });

  // Forward Shopify's webhook id as Idempotency-Key so the backend
  // can dedupe retries.
  if (input.webhookId) {
    headers["Idempotency-Key"] = input.webhookId;
  }

  const response = await fetchWithTimeout(
    `${BACKEND_API_URL}/api/shopify-app/order-webhook`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        shop: input.shop,
        order: input.order,
        topic: input.topic,
        webhookId: input.webhookId,
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Backend order forward failed: ${response.status} ${body.slice(0, 200)}`
    );
  }
}

// ============================================================
// POST /api/shopify-app/compliance
// Forwards mandatory GDPR compliance webhooks
// (customers/data_request, customers/redact, shop/redact)
// so the backend can export or erase the relevant data.
// Throws on failure.
// ============================================================
export async function forwardComplianceToBackend(input: {
  shop: string;
  topic: string;
  payload: unknown;
}): Promise<void> {
  const response = await fetchWithTimeout(
    `${BACKEND_API_URL}/api/shopify-app/compliance`,
    {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        shop: input.shop,
        topic: input.topic,
        payload: input.payload,
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Backend compliance forward failed: ${response.status} ${body.slice(0, 200)}`
    );
  }
}
