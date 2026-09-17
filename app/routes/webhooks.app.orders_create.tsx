import { authenticate } from "../shopify.server";
import type { ActionFunctionArgs } from "@remix-run/node";
import { forwardOrderToBackend } from "../services/partner.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  if (topic !== "ORDERS_CREATE") {
    return new Response("Unexpected webhook topic", { status: 400 });
  }

  try {
    await forwardOrderToBackend({ shop, order: payload });
  } catch (error) {
    console.error("Failed to forward order to backend:", error);
  }

  return new Response("OK", { status: 200 });
};