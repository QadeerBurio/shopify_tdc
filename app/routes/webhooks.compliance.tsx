// app/routes/webhooks.compliance.tsx
//
// Mandatory GDPR compliance webhooks:
//   CUSTOMERS_DATA_REQUEST, CUSTOMERS_REDACT, SHOP_REDACT
//
// authenticate.webhook verifies the HMAC and throws a 401 Response
// when it is invalid. That error is deliberately NOT caught so
// Shopify's review check sees the 401.
import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate, sessionStorage } from "../shopify.server";
import { forwardComplianceToBackend } from "../services/partner.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`[webhooks.compliance] ${topic} for ${shop}`);

  try {
    switch (topic) {
      case "CUSTOMERS_DATA_REQUEST":
      case "CUSTOMERS_REDACT":
        await forwardComplianceToBackend({ shop, topic, payload });
        break;

      case "SHOP_REDACT": {
        const sessions = await sessionStorage.findSessionsByShop(shop);
        if (sessions.length > 0) {
          await sessionStorage.deleteSessions(sessions.map((s) => s.id));
        }
        console.log(
          `[webhooks.compliance] deleted ${sessions.length} session(s) for ${shop}`
        );
        await forwardComplianceToBackend({ shop, topic, payload });
        break;
      }

      default:
        console.warn(`[webhooks.compliance] unexpected topic=${topic}`);
    }
  } catch (err) {
    console.error(
      `[webhooks.compliance] handling ${topic} failed for ${shop}:`,
      (err as Error).message
    );
  }

  return new Response(null, { status: 200 });
};
