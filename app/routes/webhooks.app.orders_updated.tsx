// app/routes/webhooks.orders.updated.tsx
//
// Shopify → Remix on order updates (refunds, cancellations, edits).
// Best-effort: we forward to the backend, but we do NOT return 500
// on failure — otherwise a long backend outage causes Shopify to
// retry-storm this endpoint for hours.
import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { forwardOrderToBackend } from "../services/partner.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  if (topic !== "ORDERS_UPDATED") {
    console.warn(`[webhooks.orders.updated] unexpected topic=${topic}`);
    return new Response("Unexpected webhook topic", { status: 400 });
  }

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
      `[webhooks.orders.updated] forwarded order=${payload?.id || payload?.order_number} shop=${shop}`
    );
  } catch (error) {
    // Non-fatal: log and return 200. The backend is idempotent, and
    // ORDERS_CREATE is the webhook that actually marks a code used.
    console.error(
      `[webhooks.orders.updated] forward failed (non-fatal) for shop=${shop}:`,
      (error as Error).message
    );
  }

  return new Response("OK", { status: 200 });
};