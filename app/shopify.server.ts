// import { webcrypto } from "node:crypto";
// if (!globalThis.crypto) {
//   // @ts-expect-error - polyfilling the global crypto object for this environment
//   globalThis.crypto = webcrypto;
// }

// import "@shopify/shopify-app-remix/adapters/node";
// import {
//   ApiVersion,
//   AppDistribution,
//   shopifyApp,
// } from "@shopify/shopify-app-remix/server";
// import { MongoDBSessionStorage } from "@shopify/shopify-app-session-storage-mongodb";

// // Talks to MongoDB directly through the native driver, no Prisma involved,
// // which avoids the _id-update restriction Prisma enforces on MongoDB.
// const mongoSessionStorage = new MongoDBSessionStorage(
//   process.env.DATABASE_URL!,
//   process.env.MONGODB_DB_NAME || "prisma"
// );

// const shopify = shopifyApp({
//   apiKey: process.env.SHOPIFY_API_KEY,
//   apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
//   apiVersion: ApiVersion.January25,
//   scopes: process.env.SCOPES?.split(","),
//   appUrl: process.env.SHOPIFY_APP_URL || "",
//   authPathPrefix: "/auth",
//   sessionStorage: mongoSessionStorage,
//   distribution: AppDistribution.AppStore,
//   future: {
//     unstable_newEmbeddedAuthStrategy: true,
//     expiringOfflineAccessTokens: true,
//   },
//   ...(process.env.SHOP_CUSTOM_DOMAIN
//     ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
//     : {}),
// });

// export default shopify;
// export const apiVersion = ApiVersion.January25;
// export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
// export const authenticate = shopify.authenticate;
// export const unauthenticated = shopify.unauthenticated;
// export const login = shopify.login;
// export const registerWebhooks = shopify.registerWebhooks;
// export const sessionStorage = shopify.sessionStorage;