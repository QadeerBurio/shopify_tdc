// This talks to Shopify's API to actually create/delete discount codes
// on a partner brand's store.
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

export interface CreateDiscountInput {
  code: string;
  discountType: "percentage" | "fixed_amount";
  discountValue: number;
  minimumSubtotal?: number;
  startsAt: string;
  endsAt?: string;
  usageLimit?: number;
  appliesOncePerCustomer?: boolean;
}

export async function createShopifyDiscount(
  admin: AdminApiContext,
  input: CreateDiscountInput
): Promise<{ id: string; code: string }> {
  const mutation = `
    mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
        codeDiscountNode {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    basicCodeDiscount: {
      title: `TDC Partner Discount - ${input.code}`,
      code: input.code,
      startsAt: input.startsAt,
      endsAt: input.endsAt || null,
      usageLimit: input.usageLimit || null,
      appliesOncePerCustomer: input.appliesOncePerCustomer ?? true,
      customerSelection: {
        all: true,
      },
      customerGets: {
        value: {
          percentage:
            input.discountType === "percentage"
              ? input.discountValue / 100
              : undefined,
          discountAmount:
            input.discountType === "fixed_amount"
              ? { amount: input.discountValue, currencyCode: "USD" }
              : undefined,
        },
        items: {
          all: true,
        },
      },
      minimumRequirement: input.minimumSubtotal
        ? {
            subtotal: {
              greaterThanOrEqualToSubtotal: input.minimumSubtotal,
            },
          }
        : undefined,
    },
  };

  const response = await admin.graphql(mutation, { variables });
  const data = await response.json();

  if (data.data?.discountCodeBasicCreate?.userErrors?.length > 0) {
    throw new Error(
      `Shopify discount creation failed: ${JSON.stringify(
        data.data.discountCodeBasicCreate.userErrors
      )}`
    );
  }

  return {
    id: data.data.discountCodeBasicCreate.codeDiscountNode.id,
    code: input.code,
  };
}

export async function deleteShopifyDiscount(
  admin: AdminApiContext,
  discountId: string
): Promise<void> {
  const mutation = `
    mutation discountCodeDelete($id: ID!) {
      discountCodeDelete(id: $id) {
        deletedCodeDiscountId
        userErrors {
          field
          message
        }
      }
    }
  `;

  const response = await admin.graphql(mutation, {
    variables: { id: discountId },
  });
  const data = await response.json();

  if (data.data?.discountCodeDelete?.userErrors?.length > 0) {
    throw new Error(
      `Shopify discount deletion failed: ${JSON.stringify(
        data.data.discountCodeDelete.userErrors
      )}`
    );
  }
}
