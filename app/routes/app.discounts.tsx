import { useLoaderData, useActionData, Form } from "@remix-run/react";
import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import {
  Page, Layout, Card, Text, Button, IndexTable, Badge, FormLayout, TextField
} from "@shopify/polaris";
import { getPartnerByShop, saveDiscountToBackend } from "../services/partner.server";
import { createShopifyDiscount } from "../services/discount.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  try {
    const partner = await getPartnerByShop(session.shop);
    if (!partner) {
      return json({ error: "Partner brand not configured", discounts: [] });
    }
    return json({ discounts: partner.discounts, error: null });
  } catch (err) {
    console.error("Discounts page: failed to reach backend:", err);
    return json({ error: `Backend request failed: ${(err as Error).message}`, discounts: [] });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const formData = await request.formData();
  const code = formData.get("code") as string;
  const discountType = formData.get("discountType") as "percentage" | "fixed_amount";
  const discountValue = parseFloat(formData.get("discountValue") as string);
  const startsAt = new Date().toISOString();
  const endsAt = (formData.get("endsAt") as string) || undefined;

  try {
    const shopifyDiscount = await createShopifyDiscount(admin, {
      code, discountType, discountValue, startsAt, endsAt,
    });

    await saveDiscountToBackend({
      shop: session.shop,
      code: shopifyDiscount.code,
      discountType,
      discountValue,
      shopifyDiscountId: shopifyDiscount.id,
      startsAt,
      endsAt,
    });

    return json({ success: true });
  } catch (error) {
    console.error("Failed to create discount:", error);
    return json({ error: (error as Error).message }, { status: 400 });
  }
};

export default function Discounts() {
  const { discounts, error } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  if (error) {
    return (
      <Page title="Discount Rules">
        <Card>
          <Text as="p" tone="critical">{error}</Text>
        </Card>
      </Page>
    );
  }

  return (
    <Page title="Discount Rules">
      <Layout>
        <Layout.Section>
          <Card>
            <Text as="h2" variant="headingMd">Create Discount Rule</Text>
            <Form method="post">
              <FormLayout>
                <TextField label="Discount Code" name="code" autoComplete="off" requiredIndicator />
                <FormLayout.Group>
                  <TextField label="Type" name="discountType" value="percentage" readOnly />
                  <TextField label="Value (%)" name="discountValue" type="number" autoComplete="off" />
                </FormLayout.Group>
                <TextField label="End Date" name="endsAt" type="date" autoComplete="off" />
                <Button submit variant="primary">Create Discount</Button>
              </FormLayout>
            </Form>
            {actionData?.error && <Text as="p" tone="critical">{actionData.error}</Text>}
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <Text as="h2" variant="headingMd">Active Rules</Text>
            <IndexTable
              resourceName={{ singular: "rule", plural: "rules" }}
              itemCount={discounts.length}
              headings={[{ title: "Code" }, { title: "Type" }, { title: "Value" }, { title: "Status" }]}
              selectable={false}
            >
              {discounts.map((rule, index) => (
                <IndexTable.Row id={rule.code} key={rule.code} position={index}>
                  <IndexTable.Cell>{rule.code}</IndexTable.Cell>
                  <IndexTable.Cell>{rule.discountType}</IndexTable.Cell>
                  <IndexTable.Cell>
                    {rule.discountType === "percentage" ? `${rule.discountValue}%` : `$${rule.discountValue}`}
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge tone={rule.isActive ? "success" : "critical"}>
                      {rule.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}