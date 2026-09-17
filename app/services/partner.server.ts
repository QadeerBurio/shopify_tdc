const BACKEND_API_URL = process.env.BACKEND_API_URL!;
const SHOPIFY_APP_API_KEY = process.env.SHOPIFY_APP_API_KEY!;

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

export async function getPartnerByShop(shop: string): Promise<BackendBrand | null> {
  const response = await fetch(
    `${BACKEND_API_URL}/api/shopify-app/brand?shop=${encodeURIComponent(shop)}`,
    { headers: { "X-API-KEY": SHOPIFY_APP_API_KEY } }
  );

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Backend brand lookup failed: ${response.status}`);

  return response.json();
}

export async function saveDiscountToBackend(input: {
  shop: string;
  code: string;
  discountType: "percentage" | "fixed_amount";
  discountValue: number;
  shopifyDiscountId: string;
  startsAt: string;
  endsAt?: string;
}): Promise<void> {
  const response = await fetch(`${BACKEND_API_URL}/api/shopify-app/discount`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": SHOPIFY_APP_API_KEY },
    body: JSON.stringify(input),
  });

  if (!response.ok) throw new Error(`Backend discount save failed: ${response.status}`);
}

export async function forwardOrderToBackend(input: {
  shop: string;
  order: unknown;
}): Promise<void> {
  const response = await fetch(`${BACKEND_API_URL}/api/shopify-app/order-webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": SHOPIFY_APP_API_KEY },
    body: JSON.stringify(input),
  });

  if (!response.ok) throw new Error(`Backend order forward failed: ${response.status}`);
}