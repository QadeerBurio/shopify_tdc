// Same idea as orders_create, but fires when an existing order changes
// (e.g. refunded, edited). Keeps our saved copy accurate.
import { authenticate } from "../shopify.server";
import type { ActionFunctionArgs } from "@remix-run/node";
import db from "../db.server";
import { getPartnerByShop } from "../services/partner.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  if (topic !== "ORDERS_UPDATED") {
    return new Response("Unexpected webhook topic", { status: 400 });
  }

  const partner = await getPartnerByShop(shop);
  if (!partner) {
    return new Response("Partner not found", { status: 200 });
  }

  const order = payload as any;

  const discountCodes: string[] = [];
  if (order.discount_codes && Array.isArray(order.discount_codes)) {
    order.discount_codes.forEach((dc: any) => {
      if (dc.code) discountCodes.push(dc.code);
    });
  }

  const partnerDiscounts = await db.discountRule.findMany({
    where: {
      partnerBrandId: partner.id,
      shopifyCode: { in: discountCodes },
    },
  });

  if (partnerDiscounts.length === 0) {
    return new Response("No partner discount found", { status: 200 });
  }

  const totalDiscount = order.total_discounts
    ? parseFloat(order.total_discounts)
    : 0;

  await db.orderAttribution.upsert({
    where: { shopifyOrderId: order.id.toString() },
    update: {
      orderTotal: parseFloat(order.total_price || "0"),
      discountAmount: totalDiscount,
      syncedAt: new Date(),
    },
    create: {
      shopifyOrderId: order.id.toString(),
      partnerBrandId: partner.id,
      discountCode: partnerDiscounts[0].shopifyCode,
      orderTotal: parseFloat(order.total_price || "0"),
      discountAmount: totalDiscount,
      currency: order.currency || "USD",
      customerId: order.customer?.id?.toString(),
      orderCreatedAt: new Date(order.created_at),
    },
  });

  return new Response("OK", { status: 200 });
};
