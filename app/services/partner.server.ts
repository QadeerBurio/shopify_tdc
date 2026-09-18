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
    { headers: authHeaders() }
  );

  if (response.status === 404) return null;

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Backend brand lookup failed: ${response.status} ${body.slice(0, 200)}`
    );
  }

  return (await response.json()) as BackendBrand;
}

// ============================================================
// POST /api/shopify-app/discount
// Used when a merchant manually creates a discount in the embedded app.
// Throws on failure. Use `saveDiscountToBackendSafe` if you don't want
// to roll back a Shopify discount that was already created.
// ============================================================
export async function saveDiscountToBackend(input: {
  shop: string;
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
      headers: authHeaders({ "Content-Type": "application/json" }),
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

// ============================================================
// Safe wrapper — never throws, logs on failure.
// Use this when the Shopify discount is already live and you
// don't want to lose the merchant's work just because the
// backend is temporarily unreachable.
// ============================================================
export async function saveDiscountToBackendSafe(input: {
  shop: string;
  code: string;
  discountType: "percentage" | "fixed_amount";
  discountValue: number;
  shopifyDiscountId: string;
  startsAt: string;
  endsAt?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await saveDiscountToBackend(input);
    return { ok: true };
  } catch (err) {
    const message = (err as Error).message;
    console.error(
      `[partner.server] saveDiscountToBackend (non-fatal) failed for code=${input.code}:`,
      message
    );
    return { ok: false, error: message };
  }
}

// ============================================================
// POST /api/shopify-app/link-shop
// Used to link a Shopify shop to a TDC brand after install.
// Never throws — returns { success, brandId?, error? }.
// ============================================================
export async function linkShopToBrand(input: {
  shop: string;
  brandId?: string;
  email?: string;
}): Promise<{ success: boolean; brandId?: string; error?: string }> {
  try {
    const response = await fetchWithTimeout(
      `${BACKEND_API_URL}/api/shopify-app/link-shop`,
      {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(input),
      }
    );

    const data = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      brandId?: string;
      error?: string;
    };

    if (!response.ok) {
      console.warn(
        `[partner.server] link-shop failed for ${input.shop}: ${response.status} ${data?.error || ""}`
      );
      return {
        success: false,
        error: data?.error || `HTTP ${response.status}`,
      };
    }

    return { success: true, brandId: data.brandId };
  } catch (err) {
    const message = (err as Error).message;
    console.error(
      `[partner.server] link-shop threw for ${input.shop}: ${message}`
    );
    return { success: false, error: message };
  }
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