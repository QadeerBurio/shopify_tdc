// app/routes/webhooks.app.scopes_update.tsx
//
// Shopify → Remix when the granted scopes change (e.g. merchant
// approves new permissions). Update the session's scope string so
// future API calls don't fail on stale scope info.
import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate, sessionStorage } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session, topic, shop } = await authenticate.webhook(
    request
  );

  console.log(`[webhooks.app.scopes_update] ${topic} for ${shop}`);

  const currentScopes = Array.isArray(payload?.current)
    ? (payload.current as string[])
    : [];

  console.log(
    `[webhooks.app.scopes_update] new scopes for ${shop}: ${currentScopes.join(",")}`
  );

  if (session) {
    try {
      // Persist the updated scopes onto the session so the app doesn't
      // keep trying to use a revoked scope on the next API call.
      session.scope = currentScopes.join(",");
      await sessionStorage.storeSession(session);
      console.log(
        `[webhooks.app.scopes_update] session ${session.id} updated with new scopes`
      );
    } catch (err) {
      console.error(
        `[webhooks.app.scopes_update] failed to update session for ${shop}:`,
        (err as Error).message
      );
    }
  } else {
    console.warn(
      `[webhooks.app.scopes_update] no session found for ${shop}`
    );
  }

  return new Response(null, { status: 200 });
};