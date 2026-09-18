// app/routes/app.discounts.tsx
import {
  useLoaderData,
  useActionData,
  useNavigation,
  Form,
} from "@remix-run/react";
import {
  json,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from "@remix-run/node";
import { authenticate } from "../shopify.server";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  IndexTable,
  Badge,
  FormLayout,
  TextField,
  Banner,
  BlockStack,
  InlineStack,
} from "@shopify/polaris";
import {
  getPartnerByShop,
  saveDiscountToBackendSafe,
} from "../services/partner.server";
import { createShopifyDiscount } from "../services/discount.server";

// ============================================================
// LOADER — fetch current discounts from the backend
// ============================================================
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  try {
    const partner = await getPartnerByShop(session.shop);
    if (!partner) {
      return json({
        error: "Partner brand not configured",
        discounts: [],
      });
    }
    return json({ discounts: partner.discounts, error: null });
  } catch (err) {
    console.error("Discounts page: failed to reach backend:", err);
    return json({
      error: `Backend request failed: ${(err as Error).message}`,
      discounts: [],
    });
  }
};

// ============================================================
// ACTION — create the discount in Shopify + save to backend
// ============================================================
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const formData = await request.formData();
  const rawCode = String(formData.get("code") || "").trim();
  const rawValue = String(formData.get("discountValue") || "").trim();
  const rawEndsAt = String(formData.get("endsAt") || "").trim();

  // ---------- Validate ----------
  const fieldErrors: Record<string, string> = {};

  if (!rawCode) {
    fieldErrors.code = "Discount code is required";
  } else if (!/^[A-Za-z0-9_-]{3,32}$/.test(rawCode)) {
    fieldErrors.code =
      "Use 3–32 letters, numbers, hyphens, or underscores only";
  }

  const discountValue = parseFloat(rawValue);
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    fieldErrors.discountValue = "Enter a value greater than 0";
  } else if (discountValue > 100) {
    fieldErrors.discountValue = "Percentage cannot exceed 100";
  }

  // endsAt: convert "YYYY-MM-DD" → full ISO at 23:59:59 UTC
  let endsAtIso: string | undefined;
  if (rawEndsAt) {
    const parsed = new Date(`${rawEndsAt}T23:59:59.000Z`);
    if (isNaN(parsed.getTime())) {
      fieldErrors.endsAt = "Invalid date";
    } else if (parsed.getTime() < Date.now()) {
      fieldErrors.endsAt = "End date must be in the future";
    } else {
      endsAtIso = parsed.toISOString();
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return json(
      { error: null, fieldErrors, success: false },
      { status: 400 }
    );
  }

  const code = rawCode.toUpperCase();
  const discountType: "percentage" = "percentage";
  const startsAt = new Date().toISOString();

  // ---------- 1. Create in Shopify ----------
  let shopifyDiscount: { id: string; code: string };
  try {
    shopifyDiscount = await createShopifyDiscount(admin, {
      code,
      discountType,
      discountValue,
      startsAt,
      endsAt: endsAtIso,
    });
  } catch (error) {
    console.error("Shopify discount creation failed:", error);
    return json(
      {
        success: false,
        error: `Shopify: ${(error as Error).message}`,
        fieldErrors: {},
      },
      { status: 400 }
    );
  }

  // ---------- 2. Save to backend (non-fatal) ----------
  // The Shopify discount already exists — if the backend write fails,
  // we don't want to lose the merchant's work. Log and continue.
  const saveResult = await saveDiscountToBackendSafe({
    shop: session.shop,
    code: shopifyDiscount.code,
    discountType,
    discountValue,
    shopifyDiscountId: shopifyDiscount.id,
    startsAt,
    endsAt: endsAtIso,
  });

  return json({
    success: true,
    error: null,
    fieldErrors: {},
    // If the backend save failed, surface it as a warning but still
    // return success — the Shopify discount is live.
    backendWarning: saveResult.ok
      ? null
      : `Discount created in Shopify, but TDC could not be updated: ${saveResult.error}`,
  });
};

// ============================================================
// COMPONENT
// ============================================================
export default function Discounts() {
  const { discounts, error } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // If the loader failed, show a friendly error and stop.
  if (error) {
    return (
      <Page title="Discount Rules">
        <Card>
          <Text as="p" tone="critical">
            {error}
          </Text>
        </Card>
      </Page>
    );
  }

  const fieldErrors =
    actionData && "fieldErrors" in actionData
      ? (actionData.fieldErrors ?? {})
      : {};

  const backendWarning =
    actionData && "backendWarning" in actionData
      ? (actionData.backendWarning ?? null)
      : null;

  const generalError =
    actionData && "error" in actionData && actionData.error
      ? actionData.error
      : null;

  const success =
    actionData && "success" in actionData && actionData.success === true;

  // Compute today's date for the `min` on the date input.
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <Page title="Discount Rules">
      <Layout>
        {/* ---------- CREATE FORM ---------- */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Create Discount Rule
              </Text>

              {success && (
                <Banner tone="success" title="Discount created">
                  The code is now live on your Shopify store.
                </Banner>
              )}

              {generalError && (
                <Banner tone="critical" title="Could not create discount">
                  <p>{generalError}</p>
                </Banner>
              )}

              {backendWarning && (
                <Banner tone="warning" title="Partial success">
                  <p>{backendWarning}</p>
                </Banner>
              )}

              <Form method="post" noValidate>
                <FormLayout>
                  <TextField
                    label="Discount Code"
                    name="code"
                    autoComplete="off"
                    requiredIndicator
                    helpText="3–32 characters. Letters, numbers, hyphens, underscores."
                    error={fieldErrors.code}
                  />

                  <FormLayout.Group>
                    <TextField
                      label="Type"
                      name="discountType"
                      value="percentage"
                      readOnly
                      autoComplete="off"
                    />
                    <TextField
                      label="Value (%)"
                      name="discountValue"
                      type="number"
                      min={1}
                      max={100}
                      step={1}
                      autoComplete="off"
                      requiredIndicator
                      error={fieldErrors.discountValue}
                    />
                  </FormLayout.Group>

                  <TextField
                    label="End Date"
                    name="endsAt"
                    type="date"
                    autoComplete="off"
                    min={todayIso}
                    helpText="Optional. Leave blank for no expiry."
                    error={fieldErrors.endsAt}
                  />

                  <InlineStack align="end">
                    <Button
                      submit
                      variant="primary"
                      loading={isSubmitting}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? "Creating…" : "Create Discount"}
                    </Button>
                  </InlineStack>
                </FormLayout>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* ---------- ACTIVE RULES ---------- */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Active Rules
              </Text>

              {discounts.length === 0 ? (
                <Text as="p" tone="subdued">
                  No discount rules yet. Create one above to get started.
                </Text>
              ) : (
                <IndexTable
                  resourceName={{ singular: "rule", plural: "rules" }}
                  itemCount={discounts.length}
                  headings={[
                    { title: "Code" },
                    { title: "Type" },
                    { title: "Value" },
                    { title: "Status" },
                  ]}
                  selectable={false}
                >
                  {discounts.map((rule, index) => (
                    <IndexTable.Row
                      id={rule.code}
                      key={rule.code}
                      position={index}
                    >
                      <IndexTable.Cell>
                        <Text as="span" fontWeight="semibold">
                          {rule.code}
                        </Text>
                      </IndexTable.Cell>
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
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}