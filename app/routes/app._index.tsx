// app/routes/app._index.tsx
import { Form, Link, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { Page, Layout, Card, Text, DataTable, Badge, Banner, BlockStack, Button } from "@shopify/polaris";
import { getPartnerByShop, startBrandConnection } from "../services/partner.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  try {
    return json({ partner: await getPartnerByShop(session.shop), unavailable: false });
  } catch (error) {
    console.error("TDC brand lookup failed:", error);
    return json({ partner: null, unavailable: true }, { status: 503 });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, redirect } = await authenticate.admin(request);
  const form = await request.formData();
  if (form.get("intent") !== "connect") {
    return json({ error: "Choose Connect your TDC account to start setup." }, { status: 400 });
  }

  let authorizationUrl: string | null;
  try {
    authorizationUrl = await startBrandConnection(session.shop);
  } catch (error) {
    console.error("Could not start TDC connection:", error);
    return json({
      error: "TDC sign-in is temporarily unavailable. Try connecting again in a few minutes.",
    }, { status: 503 });
  }
  return authorizationUrl ? redirect(authorizationUrl, { target: "_top" }) : redirect("/app");
};

export default function Dashboard() {
  const { partner, unavailable } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();

  if (unavailable || !partner) {
    return (
      <Page title="The Deft Crew">
        <Card>
          <BlockStack gap="300">
            {unavailable ? (
              <Banner tone="critical" title="TDC is temporarily unavailable">
                Reopen TDC from Shopify Admin in a few minutes to check your connection.
              </Banner>
            ) : (
              <>
                <Text as="h2" variant="headingMd">Connect your store</Text>
                <Text as="p">
                  Sign in to TDC, choose a brand you manage, and confirm the store connection.
                  After connecting, reopen TDC from Shopify Admin and select Discounts to continue.
                </Text>
                <Text as="p" tone="subdued">
                  If sign-in fails, try again with your TDC account. If your brand is missing,
                  ask its owner to grant you permission to manage store connections.
                </Text>
                {actionData?.error && <Banner tone="critical">{actionData.error}</Banner>}
                <Form method="post">
                  <input type="hidden" name="intent" value="connect" />
                  <Button submit variant="primary" loading={navigation.state !== "idle"}>
                    Connect your TDC account
                  </Button>
                </Form>
              </>
            )}
          </BlockStack>
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
            <Link to="/app/discounts">Go to Discounts</Link>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}