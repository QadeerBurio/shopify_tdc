// app/routes/install.tsx
// Entry point from the TDC web app: /install?shop=...
import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return new Response("Missing ?shop= parameter", { status: 400 });
  }

  return redirect(`/auth/login?shop=${encodeURIComponent(shop)}`);
};
