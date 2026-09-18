// app/routes/webhooks.app.uninstalled.tsx
//
// Shopify → Remix when the merchant uninstalls the app.
// Deletes the stored offline session so a stale access token
// isn't reused if the merchant later reinstalls.
import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate, sessionStorage } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`[webhooks.app.uninstalled] ${topic} for ${shop}`);

  if (session) {
    try {
      await sessionStorage.deleteSession(session.id);
      console.log(
        `[webhooks.app.uninstalled] deleted session ${session.id} for ${shop}`
      );
    } catch (err) {
      console.error(
        `[webhooks.app.uninstalled] failed to delete session for ${shop}:`,
        (err as Error).message
      );
    }
  } else {
    console.warn(
      `[webhooks.app.uninstalled] no session found for ${shop} (already cleaned up?)`
    );
  }

  return new Response(null, { status: 200 });
};