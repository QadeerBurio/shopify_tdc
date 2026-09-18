// app/routes/app._index.tsx
import { useLoaderData } from "@remix-run/react";
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { Page, Layout, Card, Text, DataTable, Badge } from "@shopify/polaris";
import { getPartnerByShop } from "../services/partner.server";
import { linkShopToBrand } from "../services/link.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  // ------------------------------------------------------------
  // STEP 1: Try to link the shop to a brand.
  //  - Prefer ?brandId=... from the install URL.
  //  - Fall back to the Shopify account email.
  // This runs on every load but is idempotent — linking twice is harmless.
  // ------------------------------------------------------------
  try {
    const url = new URL(request.url);
    const brandIdFromQuery = url.searchParams.get("brandId") || undefined;

    // session.onlineAccessInfo?.associated_user?.email is the logged-in
    // merchant's email (Shopify staff user who installed the app).
    const email =
      (session as any)?.onlineAccessInfo?.associated_user?.email ||
      (session as any)?.email ||
      undefined;

    const linkResult = await linkShopToBrand({
      shop: session.shop,
      brandId: brandIdFromQuery,
      email,
    });

    if (!linkResult.success) {
      console.warn(`[app._index] link-shop failed: ${linkResult.error}`);
      // Not fatal — proceed to try to load partner anyway.
    }
  } catch (err) {
    console.error("[app._index] link-shop threw:", err);
  }

  // ------------------------------------------------------------
  // STEP 2: Load the partner ROI from the backend.
  // ------------------------------------------------------------
  try {
    const partner = await getPartnerByShop(session.shop);
    if (!partner) {
      return json({
        error: "Partner brand not configured",
        partner: null,
      });
    }
    return json({ partner, error: null });
  } catch (err) {
    console.error("Dashboard: failed to reach backend:", err);
    return json({
      error: `Backend request failed: ${(err as Error).message}`,
      partner: null,
    });
  }
};

export default function Dashboard() {
  const { partner, error } = useLoaderData<typeof loader>();

  if (error || !partner) {
    return (
      <Page title="The Deft Crew">
        <Card>
          <Text as="p" tone="critical">
            {error ?? "No data available"}
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            If this is your first time opening the app, wait a few seconds and
            refresh — the app may still be linking your store.
          </Text>
        </Card>
      </Page>
    );
  }

  const { roi } = partner;

  const rows = [
    ["Total Orders", roi.totalOrders.toString()],
    ["Total Revenue", `$${roi.totalRevenue.toFixed(2)}`],
    ["Total Discount Given", `$${roi.totalDiscount.toFixed(2)}`],
    ["Net Revenue", `$${roi.netRevenue.toFixed(2)}`],
    ["Unique Customers", roi.uniqueCustomers.toString()],
    ["Average Order Value", `$${roi.avgOrderValue.toFixed(2)}`],
  ];

  return (
    <Page title="The Deft Crew — Partner Dashboard">
      <Layout>
        <Layout.Section>
          <Card>
            <Text as="h2" variant="headingMd">
              ROI Summary (Last 30 Days)
            </Text>
            <DataTable
              columnContentTypes={["text", "text"]}
              headings={["Metric", "Value"]}
              rows={rows}
            />
          </Card>
        </Layout.Section>
        <Layout.Section>
          <Card>
            <Text as="h2" variant="headingMd">
              Partner Brand
            </Text>
            <Text as="p">{partner.brandName}</Text>
            <Badge tone="success">Active</Badge>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}