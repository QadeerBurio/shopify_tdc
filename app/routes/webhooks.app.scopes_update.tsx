// Fires if the app's permissions ever change. Updates our saved
// record so it matches what Shopify actually granted.
import { authenticate } from "../shopify.server";
import type { ActionFunctionArgs } from "@remix-run/node";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session } = await authenticate.webhook(request);
  const current = payload.current as string[];

  if (session) {
    await db.session.update({
      where: { id: session.id },
      data: { scope: current.toString() },
    });
  }

  return new Response();
};
