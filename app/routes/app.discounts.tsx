import { useState } from "react";
import {
  useLoaderData,
  useActionData,
  useNavigation,
  Form,
  Link,
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
import { getPartnerByShop } from "../services/partner.server";
import {
  getPendingDiscount,
  listPendingDiscounts,
  prepareDiscount,
  syncMerchantDiscount,
} from "../services/discount-sync.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  try {
    const partner = await getPartnerByShop(session.shop);
    if (!partner) return json({ state: "unlinked" as const });

    const pending = await listPendingDiscounts(session.shop, partner.id);
    return json({
      state: "linked" as const,
      discounts: partner.discounts,
      pending: pending.map(({ id, code, shopifyDiscountId }) => ({
        id, code, existsInShopify: Boolean(shopifyDiscountId),
      })),
    });
  } catch (error) {
    console.error("Could not load TDC discounts:", error);
    return json({ state: "unavailable" as const }, { status: 503 });
  }
};

interface DiscountAction {
  error: string | null;
  success: boolean;
  fieldErrors?: Record<string, string>;
  pending?: boolean;
}

function failure(error: string, status: number) {
  return json<DiscountAction>({ error, success: false }, { status });
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();

  try {
    const partner = await getPartnerByShop(session.shop);
    if (!partner) return failure("Connect your TDC account on Home first.", 409);

    if (formData.get("intent") === "retry") {
      const id = String(formData.get("id") || "");
      const record = await getPendingDiscount(session.shop, partner.id, id);
      if (!record) return failure("This discount could not be found for your store.", 404);
      return syncResponse(await syncMerchantDiscount(admin, record, false));
    }
    if (formData.get("intent") !== "create") return failure("Choose a discount action.", 400);

    return await createDiscount(formData, session.shop, partner.id, admin);
  } catch (error) {
    console.error("TDC discount request failed:", error);
    return failure("Could not complete the discount request. Check Pending TDC Saves and try again.", 503);
  }
};

async function createDiscount(
  formData: FormData,
  shop: string,
  brandId: string,
  admin: Parameters<typeof syncMerchantDiscount>[0],
) {
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

  const discountValue = Number(rawValue);
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    fieldErrors.discountValue = "Enter a value greater than 0";
  } else if (discountValue > 100) {
    fieldErrors.discountValue = "Percentage cannot exceed 100";
  }

  // endsAt: convert "YYYY-MM-DD" → full ISO at 23:59:59 UTC
  let endsAtIso: string | undefined;
  if (rawEndsAt) {
    const parsed = new Date(`${rawEndsAt}T23:59:59.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawEndsAt) ||
        isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== rawEndsAt) {
      fieldErrors.endsAt = "Invalid date";
    } else if (parsed.getTime() < Date.now()) {
      fieldErrors.endsAt = "End date must be in the future";
    } else {
      endsAtIso = parsed.toISOString();
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return json<DiscountAction>(
      { error: null, fieldErrors, success: false },
      { status: 400 }
    );
  }

  const record = await prepareDiscount({
    shop,
    brandId,
    code: rawCode.toUpperCase(),
    discountValue,
    endsAt: endsAtIso ?? null,
  });
  if (!record) return failure("This code already has a TDC request with different settings. Use a different code or retry the original save.", 409);
  return syncResponse(await syncMerchantDiscount(admin, record, true));
}

function syncResponse(result: Awaited<ReturnType<typeof syncMerchantDiscount>>) {
  switch (result) {
    case "synced":
      return json<DiscountAction>({ error: null, success: true });
    case "pending":
      return json<DiscountAction>({ error: null, success: false, pending: true }, { status: 202 });
    case "missing":
      return failure("Shopify could not find the discount. If it was never created, submit Create Discount again with the original settings. If it was removed, use a new code.", 409);
    case "conflict":
      return failure("This code belongs to a different Shopify discount. Choose a different code.", 409);
  }
}

export default function Discounts() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const [code, setCode] = useState("");
  const [value, setValue] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const savePending = actionData?.pending;

  if (loaderData.state !== "linked") {
    return (
      <Page title="Discount Rules">
        <Card>
          <BlockStack gap="300">
            {loaderData.state === "unlinked" ? (
              <>
                <Text as="p">Connect your TDC account on Home, then return to Discounts from the app menu.</Text>
                <Link to="/app">Go to setup</Link>
              </>
            ) : (
              <Banner tone="critical" title="TDC discounts are temporarily unavailable">
                {savePending
                  ? "The Shopify discount exists. Reopen Discounts to retry its pending TDC save once TDC is available."
                  : "Reopen Discounts in a few minutes to try again."}
              </Banner>
            )}
          </BlockStack>
        </Card>
      </Page>
    );
  }

  const { discounts, pending } = loaderData;
  const fieldErrors = actionData?.fieldErrors;
  const isCreating = busy && navigation.formData?.get("intent") === "create";

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

              {actionData?.success && (
                <Banner tone="success" title="Discount saved">
                  The discount is saved in Shopify and TDC.
                </Banner>
              )}

              {actionData?.error && (
                <Banner tone="critical" title="Discount request could not be completed">
                  <p>{actionData.error}</p>
                </Banner>
              )}

              {savePending && (
                <Banner tone="warning" title="Shopify discount exists. TDC save is pending">
                  <p>Use Retry TDC Save under Pending TDC Saves.</p>
                </Banner>
              )}

              <Form method="post" noValidate>
                <input type="hidden" name="intent" value="create" />
                <FormLayout>
                  <TextField
                    label="Discount Code"
                    name="code"
                    value={code}
                    onChange={setCode}
                    autoComplete="off"
                    requiredIndicator
                    helpText="3–32 characters. Letters, numbers, hyphens, underscores."
                    error={fieldErrors?.code}
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
                      value={value}
                      onChange={setValue}
                      type="number"
                      min={1}
                      max={100}
                      step={1}
                      autoComplete="off"
                      requiredIndicator
                      error={fieldErrors?.discountValue}
                    />
                  </FormLayout.Group>

                  <TextField
                    label="End Date"
                    name="endsAt"
                    value={endsAt}
                    onChange={setEndsAt}
                    type="date"
                    autoComplete="off"
                    min={todayIso}
                    helpText="Optional. Leave blank for no expiry."
                    error={fieldErrors?.endsAt}
                  />

                  <InlineStack align="end">
                    <Button
                      submit
                      variant="primary"
                      loading={isCreating}
                      disabled={busy}
                    >
                      {isCreating ? "Creating..." : "Create Discount"}
                    </Button>
                  </InlineStack>
                </FormLayout>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>

        {pending.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Pending TDC Saves</Text>
                {pending.map(({ id, code, existsInShopify }) => (
                  <Form method="post" key={id}>
                    <input type="hidden" name="intent" value="retry" />
                    <input type="hidden" name="id" value={id} />
                    <InlineStack gap="300" blockAlign="center">
                      <Text as="p">
                        {code} · {existsInShopify ? "Shopify discount exists" : "Shopify discount needs verification"}
                      </Text>
                      <Button submit disabled={busy}>Retry TDC Save</Button>
                    </InlineStack>
                  </Form>
                ))}
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

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