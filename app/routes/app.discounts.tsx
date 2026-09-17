// This screen lets a brand create a new discount code (which gets
// created on their real Shopify store) and see the ones already made.
import { useLoaderData, useActionData, Form } from "@remix-run/react";
import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import {
  Page, Layout, Card, Text, Button, IndexTable, Badge, FormLayout, TextField
} from "@shopify/polaris";
import db from "../db.server";
import { getPartnerByShop } from "../services/partner.server";
import { createShopifyDiscount } from "../services/discount.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const partner = await getPartnerByShop(session.shop);

  if (!partner) {
    return json({ error: "Partner brand not configured" }, { status: 404 });
  }

  const rules = await db.discountRule.findMany({
    where: { partnerBrandId: partner.id },
    orderBy: { createdAt: "desc" },
  });

  return json({ rules });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const partner = await getPartnerByShop(session.shop);

  if (!partner) {
    return json({ error: "Partner brand not configured" }, { status: 404 });
  }

  const formData = await request.formData();
  const code = formData.get("code") as string;
  const discountType = formData.get("discountType") as "percentage" | "fixed_amount";
  const discountValue = parseFloat(formData.get("discountValue") as string);
  const startsAt = new Date().toISOString();
  const endsAt = (formData.get("endsAt") as string) || undefined;

  try {
    const shopifyDiscount = await createShopifyDiscount(admin, {
      code,
      discountType,
      discountValue,
      startsAt,
      endsAt,
    });

    await db.discountRule.create({
      data: {
        partnerBrandId: partner.id,
        shopifyDiscountId: shopifyDiscount.id,
        shopifyCode: shopifyDiscount.code,
        discountType,
        discountValue,
        startsAt: new Date(startsAt),
        endsAt: endsAt ? new Date(endsAt) : null,
        isActive: true,
      },
    });

    return json({ success: true });
  } catch (error) {
    return json({ error: (error as Error).message }, { status: 400 });
  }
};

export default function Discounts() {
  const { rules } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

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
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <Text as="h2" variant="headingMd">Active Rules</Text>
            <IndexTable
              resourceName={{ singular: "rule", plural: "rules" }}
              itemCount={rules.length}
              headings={[
                { title: "Code" },
                { title: "Type" },
                { title: "Value" },
                { title: "Status" },
              ]}
              selectable={false}
            >
              {rules.map((rule, index) => (
                <IndexTable.Row id={rule.id} key={rule.id} position={index}>
                  <IndexTable.Cell>{rule.shopifyCode}</IndexTable.Cell>
                  <IndexTable.Cell>{rule.discountType}</IndexTable.Cell>
                  <IndexTable.Cell>
                    {rule.discountType === "percentage"
                      ? `${rule.discountValue}%`
                      : `$${rule.discountValue}`}
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
