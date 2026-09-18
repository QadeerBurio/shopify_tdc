// app/services/link.server.ts
const BACKEND_API_URL = process.env.BACKEND_API_URL!;
const SHOPIFY_APP_API_KEY = process.env.SHOPIFY_APP_API_KEY!;

export async function linkShopToBrand(input: {
  shop: string;
  brandId?: string;
  email?: string;
}): Promise<{ success: boolean; brandId?: string; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/shopify-app/link-shop`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": SHOPIFY_APP_API_KEY,
      },
      body: JSON.stringify(input),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { success: false, error: data?.error || `HTTP ${response.status}` };
    }
    return { success: true, brandId: data.brandId };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}