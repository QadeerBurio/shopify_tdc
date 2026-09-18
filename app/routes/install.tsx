// app/routes/install.tsx
// Entry point from the TDC web app: /install?shop=...&brandId=...
import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const brandId = url.searchParams.get("brandId");

  if (!shop) {
    return new Response("Missing ?shop= parameter", { status: 400 });
  }

  // Pass brandId through Shopify's OAuth state param
  const state = brandId ? `brandId:${brandId}` : "";
  const redirectUrl = `/auth/login?shop=${encodeURIComponent(
    shop
  )}${state ? `&state=${encodeURIComponent(state)}` : ""}`;

  return redirect(redirectUrl);
};