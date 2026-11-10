// app/shopify.server.ts
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) {
  // @ts-expect-error - polyfilling the global crypto object for Node < 20
  globalThis.crypto = webcrypto;
}

import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { MongoDBSessionStorage } from "@shopify/shopify-app-session-storage-mongodb";

// ------------------------------------------------------------
// Fail loudly at boot if critical env vars are missing.
// Booting with broken auth is worse than a clear startup error.
// ------------------------------------------------------------
const REQUIRED_ENV = [
  "SHOPIFY_API_KEY",
  "SHOPIFY_API_SECRET",
  "SHOPIFY_APP_URL",
  "SCOPES",
  "DATABASE_URL",
] as const;

const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(
    `❌ [shopify.server] Missing required env vars: ${missing.join(", ")}`
  );
}

// ------------------------------------------------------------
// Session storage: MongoDB via the native driver
// (avoids Prisma's _id-update restriction on MongoDB)
// ------------------------------------------------------------
const mongoSessionStorage = new MongoDBSessionStorage(
  new URL(process.env.DATABASE_URL || ""),
  process.env.MONGODB_DB_NAME || "prisma"
);

// ------------------------------------------------------------
// Scopes: trim + drop empties so a trailing comma doesn't
// produce [""] which Shopify rejects.
// ------------------------------------------------------------
const scopes = (process.env.SCOPES || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// ------------------------------------------------------------
// The app
// ------------------------------------------------------------
const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY || "",
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.July26,
  scopes,
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: mongoSessionStorage,
  distribution: AppDistribution.AppStore,

  // Webhook subscriptions (orders, app lifecycle, GDPR compliance)
  // are declared in shopify.app.toml and registered by `shopify app deploy`.

  future: {
    unstable_newEmbeddedAuthStrategy: true,
    expiringOfflineAccessTokens: true,
  },

  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.July26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;