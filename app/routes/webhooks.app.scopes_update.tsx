import { authenticate } from "../shopify.server";
import type { ActionFunctionArgs } from "@remix-run/node";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session } = await authenticate.webhook(request);
  const current = payload.current as string[];

  console.log(`Scopes updated for session ${session?.id}:`, current);
  return new Response();
};