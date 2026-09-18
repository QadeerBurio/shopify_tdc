// app/routes/webhooks.orders.create.tsx
//
// Shopify → Remix on every new order.
// Verify HMAC, forward to backend, return 500 on failure so
// Shopify retries (which is what keeps promo-code redemption
// from being silently lost when the backend is briefly down).
import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { forwardOrderToBackend } from "../services/partner.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  if (topic !== "ORDERS_CREATE") {
    console.warn(`[webhooks.orders.create] unexpected topic=${topic}`);
    return new Response("Unexpected webhook topic", { status: 400 });
  }

  // Shopify sends a unique id per webhook delivery. Forwarding it
  // lets the backend dedupe Shopify retries of the same event.
  const webhookId =
    request.headers.get("x-shopify-webhook-id") || undefined;

  try {
    await forwardOrderToBackend({
      shop,
      order: payload,
      topic,
      webhookId,
    });
    console.log(
      `[webhooks.orders.create] forwarded order=${payload?.id || payload?.order_number} shop=${shop}`
    );
  } catch (error) {
    console.error(
      `[webhooks.orders.create] forward failed for shop=${shop}:`,
      (error as Error).message
    );
    // ✅ Return 500 so Shopify retries the webhook.
    // Retries: ~5s, 5m, 30m, 2h, 5h, 10h (up to ~48h).
    // Without this, the redemption is lost forever.
    return new Response("Backend forward failed", { status: 500 });
  }

  return new Response("OK", { status: 200 });
};