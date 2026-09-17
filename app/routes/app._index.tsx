// This is the first screen a brand sees when they open the app -
// a summary of orders, revenue, and discounts from the last 30 days.
// All the real data comes from the existing backend, not a local database.
import { useLoaderData } from "@remix-run/react";
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { Page, Layout, Card, Text, DataTable, Badge } from "@shopify/polaris";
import { getPartnerByShop } from "../services/partner.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  try {
    const partner = await getPartnerByShop(session.shop);
    if (!partner) {
      return json({ error: "Partner brand not configured", partner: null });
    }
    return json({ partner, error: null });
  } catch (err) {
    console.error("Dashboard: failed to reach backend:", err);
    return json({
      error:
        "Couldn't connect to the backend service. Check that BACKEND_API_URL is set correctly, and that the backend endpoints are live.",
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
          <Text as="p" tone="critical">{error ?? "No data available"}</Text>
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