// app/routes/auth.$.tsx
import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { linkShopToBrand } from "../services/link.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  // Extract brandId from state if it was passed through
  const url = new URL(request.url);
  const stateParam = url.searchParams.get("state") || "";
  let brandId: string | undefined;
  if (stateParam.startsWith("brandId:")) {
    brandId = stateParam.slice("brandId:".length);
  }

  if (brandId) {
    try {
      await linkShopToBrand({ shop: session.shop, brandId });
    } catch (err) {
      console.error("[auth] link-shop with brandId failed:", err);
    }
  }

  return null;
};