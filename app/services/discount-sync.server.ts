import { createHash, randomUUID } from "node:crypto";
import { Prisma, PrismaClient, type DiscountSync } from "@prisma/client";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { createShopifyDiscount, findShopifyDiscount } from "./discount.server";
import { saveDiscountToBackend } from "./partner.server";

let db: PrismaClient | undefined;

function journal() {
  if (!db) {
    const url = new URL(process.env.DATABASE_URL || "");
    url.pathname = "/" + encodeURIComponent(process.env.MONGODB_DB_NAME || "prisma");
    db = new PrismaClient({ datasourceUrl: url.href });
  }
  return db.discountSync;
}

export function listPendingDiscounts(shop: string, brandId: string) {
  return journal().findMany({ where: { shop, brandId, syncedAt: null } });
}

export function deleteDiscountSyncHistory(shop: string) {
  return journal().deleteMany({ where: { shop } });
}

export function getPendingDiscount(shop: string, brandId: string, id: string) {
  return journal().findFirst({ where: { id, shop, brandId } });
}

export async function prepareDiscount(
  input: Pick<DiscountSync, "shop" | "brandId" | "code" | "discountValue" | "endsAt">
) {
  // MongoDB enforces uniqueness on _id, including simultaneous submissions.
  const id = createHash("sha256").update(JSON.stringify([input.shop, input.code])).digest("hex");
  let record: DiscountSync;
  try {
    record = await journal().create({
      data: {
        id,
        ...input,
        startsAt: new Date().toISOString(),
        shopifyTag: `tdc-sync-${randomUUID()}`,
        shopifyDiscountId: null,
        syncedAt: null,
      },
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }
    record = await journal().findUniqueOrThrow({ where: { id } });
  }

  if (record.brandId !== input.brandId ||
      record.discountValue !== input.discountValue || record.endsAt !== input.endsAt) {
    return null;
  }
  return record;
}

export function syncMerchantDiscount(admin: AdminApiContext, record: DiscountSync, allowCreate: boolean) {
  return syncDiscount(record, allowCreate, {
    lookup: () => findShopifyDiscount(admin, record.code),
    create: (input) => createShopifyDiscount(admin, input),
    rememberId: async (id) => {
      await journal().update({ where: { id: record.id }, data: { shopifyDiscountId: id } });
    },
    save: saveDiscountToBackend,
    finish: async () => {
      await journal().update({ where: { id: record.id }, data: { syncedAt: new Date() } });
    },
  });
}

export async function syncDiscount(
  record: DiscountSync,
  allowCreate: boolean,
  operations: {
    lookup: () => Promise<{ id: string; tags: string[] } | null>;
    create: (input: Parameters<typeof createShopifyDiscount>[1]) => Promise<{ id: string }>;
    rememberId: (id: string) => Promise<void>;
    save: typeof saveDiscountToBackend;
    finish: () => Promise<void>;
  }
): Promise<"synced" | "pending" | "missing" | "conflict"> {
  if (record.syncedAt) return "synced";

  const { shop, brandId, code, discountValue, startsAt, shopifyTag } = record;
  const endsAt = record.endsAt ?? undefined;
  const input = { code, discountType: "percentage" as const, discountValue, startsAt, endsAt };
  let discount = await operations.lookup();

  if (!discount && !record.shopifyDiscountId && allowCreate) {
    // A previous create may have succeeded without returning its response.
    // Shopify enforces code uniqueness and the tag identifies this request.
    try {
      const created = await operations.create({ ...input, tags: [shopifyTag] });
      discount = { id: created.id, tags: [shopifyTag] };
    } catch (error) {
      discount = await operations.lookup();
      if (!discount) throw error;
    }
  }
  if (!discount) return "missing";
  if (record.shopifyDiscountId
    ? discount.id !== record.shopifyDiscountId
    : !discount.tags.includes(shopifyTag)) {
    return "conflict";
  }

  try {
    await operations.rememberId(discount.id);
    await operations.save({ shop, brandId, ...input, shopifyDiscountId: discount.id });
    await operations.finish();
    return "synced";
  } catch (error) {
    console.error("TDC discount sync remains pending:", error);
    return "pending";
  }
}
