import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiscountSync } from "@prisma/client";

process.env.BACKEND_API_URL = "https://tdc-api.example";
process.env.TDC_CONNECT_ORIGIN = "https://tdc.example";
process.env.SHOPIFY_APP_API_KEY = "test-key";

test("fresh-store connection uses only the authenticated shop and accepts only the TDC origin", async (t) => {
  const { startBrandConnection } = await import("../app/services/partner.server");

  const context = t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    const endpoint = new URL(url);
    assert.equal(endpoint.origin, "https://tdc-api.example");
    assert.equal(init.redirect, "error");

    if (endpoint.pathname === "/api/shopify-app/brand") {
      assert.equal(endpoint.searchParams.get("shop"), "review.myshopify.com");
      return new Response(null, { status: 404 });
    }

    assert.equal(endpoint.pathname, "/api/shopify-app/link-shop/start");
    assert.equal(init.method, "POST");
    assert.deepEqual(JSON.parse(String(init.body)), { shop: "review.myshopify.com" });
    return Response.json({ authorizationUrl: "https://tdc.example/link/opaque-ticket" });
  });

  assert.equal(await startBrandConnection("review.myshopify.com"), "https://tdc.example/link/opaque-ticket");
  assert.equal(context.mock.callCount(), 2);

  context.mock.mockImplementation(async (url: string) => {
    if (url.includes("/brand?")) return new Response(null, { status: 404 });
    return new Response(null, { status: 403 });
  });
  await assert.rejects(startBrandConnection("review.myshopify.com"), /403/);

  context.mock.mockImplementation(async (url: string) => {
    if (url.includes("/brand?")) return new Response(null, { status: 404 });
    return Response.json({ authorizationUrl: "https://untrusted.example/link" });
  });
  await assert.rejects(startBrandConnection("review.myshopify.com"), /Unexpected TDC authorization URL/);

  context.mock.mockImplementation(async (url: string) => {
    assert.ok(url.includes("/brand?"));
    return Response.json({ id: "brand-a", brandName: "Review brand", roi: {}, discounts: [] });
  });
  assert.equal(await startBrandConnection("review.myshopify.com"), null);
});

const original: DiscountSync = {
  id: "request-id",
  shop: "review.myshopify.com",
  brandId: "brand-a",
  code: "REVIEW10",
  discountValue: 10,
  startsAt: "2026-11-20T00:00:00Z",
  endsAt: null,
  shopifyDiscountId: null,
  shopifyTag: "tdc-sync-test",
  syncedAt: null,
};

test("TDC saves send the same idempotency key for the same shop and Shopify discount", async (t) => {
  const { saveDiscountToBackend } = await import("../app/services/partner.server");
  const keys: Array<string | null> = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "https://tdc-api.example/api/shopify-app/discount");
    const headers = new Headers(init.headers);
    assert.equal(headers.get("X-API-KEY"), "test-key");
    assert.equal(JSON.parse(String(init.body)).brandId, original.brandId);
    keys.push(headers.get("Idempotency-Key"));
    return new Response(null, { status: 204 });
  });

  const { shop, brandId, code, discountValue, startsAt } = original;
  const input = {
    shop, brandId, code, discountValue, startsAt,
    discountType: "percentage" as const,
    shopifyDiscountId: "gid://shopify/DiscountCodeNode/1",
  };
  await saveDiscountToBackend(input);
  await saveDiscountToBackend(input);
  await saveDiscountToBackend({ ...input, shop: "other.myshopify.com" });
  assert.match(keys[0] ?? "", /^[a-f0-9]{64}$/);
  assert.equal(keys[0], keys[1]);
  assert.notEqual(keys[0], keys[2]);
});

test("a lost Shopify create response and failed TDC save recover without another Shopify create", async (t) => {
  const { syncDiscount } = await import("../app/services/discount-sync.server");
  t.mock.method(console, "error", () => undefined);
  let record = { ...original };
  let shopify: { id: string; tags: string[] } | null = null;
  let creates = 0;
  const saves: string[] = [];

  const operations: Parameters<typeof syncDiscount>[2] = {
    lookup: async () => shopify,
    create: async ({ tags }) => {
      creates += 1;
      shopify = { id: "gid://shopify/DiscountCodeNode/1", tags: tags ?? [] };
      throw new Error("Connection dropped after Shopify wrote the discount");
    },
    rememberId: async (shopifyDiscountId) => { record = { ...record, shopifyDiscountId }; },
    save: async ({ shopifyDiscountId, shop, brandId }) => {
      assert.equal(shop, original.shop);
      assert.equal(brandId, original.brandId);
      saves.push(shopifyDiscountId);
      if (saves.length === 1) throw new Error("TDC unavailable");
    },
    finish: async () => { record = { ...record, syncedAt: new Date() }; },
  };

  assert.equal(await syncDiscount(record, true, operations), "pending");
  assert.equal(record.shopifyDiscountId, "gid://shopify/DiscountCodeNode/1");
  assert.equal(await syncDiscount({ ...record }, false, operations), "synced");
  assert.equal(await syncDiscount({ ...record }, true, operations), "synced");
  assert.equal(creates, 1);
  assert.deepEqual(saves, Array(2).fill(record.shopifyDiscountId));
});

test("retry never creates a missing Shopify discount or adopts another discount", async () => {
  const { syncDiscount } = await import("../app/services/discount-sync.server");
  const unexpected = async () => assert.fail("Unexpected write");
  const operations: Parameters<typeof syncDiscount>[2] = {
    lookup: async () => null,
    create: unexpected,
    rememberId: unexpected,
    save: unexpected,
    finish: unexpected,
  };

  assert.equal(await syncDiscount(original, false, operations), "missing");
  operations.lookup = async () => ({ id: "different-discount", tags: [] });
  assert.equal(await syncDiscount(original, true, operations), "conflict");
  operations.lookup = async () => ({ id: "different-discount", tags: [original.shopifyTag] });
  assert.equal(await syncDiscount({ ...original, shopifyDiscountId: "expected-id" }, false, operations), "conflict");
});
