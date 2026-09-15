// This is the first screen a brand sees when they open the app -
// a summary of orders, revenue, and discounts from the last 30 days.
import { useLoaderData } from "@remix-run/react";
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { Page, Layout, Card, Text, DataTable, Badge } from "@shopify/polaris";
import { getPartnerRoi } from "../services/analytics.server";
import { getPartnerByShop } from "../services/partner.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const partner = await getPartnerByShop(session.shop);

  if (!partner) {
    return json({ error: "Partner brand not configured" }, { status: 404 });
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const roi = await getPartnerRoi(partner.id, thirtyDaysAgo, now);

  return json({
    partner,
    roi: {
      ...roi,
      periodStart: roi.periodStart.toISOString(),
      periodEnd: roi.periodEnd.toISOString(),
    },
  });
};

export default function Dashboard() {
  const { partner, roi, error } = useLoaderData<typeof loader>();

  if (error) {
    return (
      <Page title="The Deft Crew">
        <Card>
          <Text as="p" tone="critical">{error}</Text>
        </Card>
      </Page>
    );
  }

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
