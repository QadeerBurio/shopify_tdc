// Fires when a brand removes the app from their store.
// We delete their saved login session, we keep their order history.
import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session } = await authenticate.webhook(request);

  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  return new Response();
};
