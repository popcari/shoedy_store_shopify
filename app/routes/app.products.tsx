import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useCallback, useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import {
  PRODUCTS_QUERY,
  PRODUCT_CREATE_MUTATION,
  VARIANT_UPDATE_MUTATION,
} from "../graphql/product-queries";
import { authenticate } from "../shopify.server";

// ---------- Types ----------
interface ProductFormData {
  title: string;
  description: string;
  productType: string;
  vendor: string;
  price: string;
  status: string;
}

interface BatchItem extends ProductFormData {
  id: string; // local batch ID
}

interface ProductNode {
  id: string;
  title: string;
  handle: string;
  status: string;
  productType: string;
  vendor: string;
  totalInventory: number;
  priceRangeV2: {
    minVariantPrice: { amount: string; currencyCode: string };
  };
  createdAt: string;
}

// ---------- Server ----------
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(PRODUCTS_QUERY, {
    variables: { first: 20 },
  });
  const data = await response.json();

  return {
    products: (data.data?.products?.nodes ?? []) as ProductNode[],
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create-batch") {
    const batchJson = formData.get("batch") as string;
    const batch: BatchItem[] = JSON.parse(batchJson);

    const results: Array<{
      title: string;
      success: boolean;
      productId?: string;
      error?: string;
    }> = [];

    for (const item of batch) {
      try {
        // Step 1: Create product
        const createResponse = await admin.graphql(PRODUCT_CREATE_MUTATION, {
          variables: {
            product: {
              title: item.title,
              descriptionHtml: item.description || undefined,
              productType: item.productType || undefined,
              vendor: item.vendor || undefined,
              status: (item.status as "ACTIVE" | "DRAFT") || "DRAFT",
            },
          },
        });
        const createData = await createResponse.json();

        if (createData.data?.productCreate?.userErrors?.length > 0) {
          results.push({
            title: item.title,
            success: false,
            error: createData.data.productCreate.userErrors
              .map((e: { message: string }) => e.message)
              .join(", "),
          });
          continue;
        }

        const product = createData.data!.productCreate!.product!;

        // Step 2: Update variant price if provided
        if (item.price && parseFloat(item.price) > 0) {
          const variantId = product.variants.edges[0]?.node?.id;
          if (variantId) {
            await admin.graphql(VARIANT_UPDATE_MUTATION, {
              variables: {
                productId: product.id,
                variants: [{ id: variantId, price: item.price }],
              },
            });
          }
        }

        results.push({
          title: item.title,
          success: true,
          productId: product.id,
        });
      } catch (error) {
        results.push({
          title: item.title,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return { intent: "create-batch", results };
  }

  return { intent: "unknown" };
};

// ---------- Constants ----------
const EMPTY_FORM: ProductFormData = {
  title: "",
  description: "",
  productType: "Shoes",
  vendor: "Shoedy",
  price: "",
  status: "DRAFT",
};

const PRODUCT_TYPES = [
  "Shoes",
  "Sneakers",
  "Boots",
  "Sandals",
  "Running Shoes",
  "Casual Shoes",
  "Formal Shoes",
];

// ---------- Component ----------
export default function ProductsPage() {
  const { products } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [batch, setBatch] = useState<BatchItem[]>([]);
  const [form, setForm] = useState<ProductFormData>({ ...EMPTY_FORM });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);

  const isCreating =
    fetcher.state !== "idle" &&
    fetcher.formData?.get("intent") === "create-batch";

  // Show toast on success
  useEffect(() => {
    if (fetcher.data && "results" in fetcher.data) {
      const successCount =
        fetcher?.data?.results?.filter((r) => r.success).length || 0;
      const failCount =
        fetcher?.data?.results?.filter((r) => !r.success).length || 0;

      if (successCount > 0) {
        shopify.toast.show(`${successCount} product(s) created successfully!`);
      }
      if (failCount > 0) {
        shopify.toast.show(`${failCount} product(s) failed to create`, {
          isError: true,
        });
      }
      setBatch([]);
    }
  }, [fetcher.data, shopify]);

  // ---------- Form handlers ----------
  const updateField = useCallback(
    (field: keyof ProductFormData, value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    },
    [],
  );

  const validateForm = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    if (!form.title.trim()) {
      newErrors.title = "Title is required";
    }
    if (
      form.price &&
      (isNaN(parseFloat(form.price)) || parseFloat(form.price) < 0)
    ) {
      newErrors.price = "Price must be a valid positive number";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form]);

  const addToBatch = useCallback(() => {
    if (!validateForm()) return;
    if (batch.length >= 10) {
      shopify.toast.show("Maximum 10 products per batch", { isError: true });
      return;
    }

    const newItem: BatchItem = {
      ...form,
      id: `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };
    setBatch((prev) => [...prev, newItem]);
    setForm({ ...EMPTY_FORM });
    shopify.toast.show(`"${newItem.title}" added to batch`);
  }, [form, batch.length, validateForm, shopify]);

  const removeFromBatch = useCallback((id: string) => {
    setBatch((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const createAll = useCallback(() => {
    if (batch.length === 0) return;

    const formData = new FormData();
    formData.append("intent", "create-batch");
    formData.append("batch", JSON.stringify(batch));
    fetcher.submit(formData, { method: "POST" });
  }, [batch, fetcher]);

  return (
    <s-page heading="Products">
      <s-button slot="primary-action" onClick={() => setShowForm(!showForm)}>
        {showForm ? "Close Form" : "Create Products"}
      </s-button>

      {/* ---- Batch Creation Form ---- */}
      {showForm && (
        <s-section heading={`Create Products (Batch: ${batch.length}/10)`}>
          <s-stack direction="block" gap="base">
            {/* Title */}
            <s-text-field
              label="Product Title *"
              value={form.title}
              onInput={(e: Event) =>
                updateField("title", (e.target as HTMLInputElement).value)
              }
              {...(errors.title ? { error: errors.title } : {})}
            />

            {/* Description */}
            <s-text-field
              label="Description"
              value={form.description}
              onInput={(e: Event) =>
                updateField("description", (e.target as HTMLInputElement).value)
              }
            />

            <s-stack direction="inline" gap="base">
              {/* Product Type */}
              <s-select
                label="Product Type"
                value={form.productType}
                onChange={(e: Event) =>
                  updateField(
                    "productType",
                    (e.target as HTMLSelectElement).value,
                  )
                }
              >
                {PRODUCT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </s-select>

              {/* Price */}
              <s-text-field
                label="Price ($)"
                value={form.price}
                onInput={(e: Event) =>
                  updateField("price", (e.target as HTMLInputElement).value)
                }
                {...(errors.price ? { error: errors.price } : {})}
              />
            </s-stack>

            <s-stack direction="inline" gap="base">
              {/* Vendor */}
              <s-text-field
                label="Vendor"
                value={form.vendor}
                onInput={(e: Event) =>
                  updateField("vendor", (e.target as HTMLInputElement).value)
                }
              />

              {/* Status */}
              <s-select
                label="Status"
                value={form.status}
                onChange={(e: Event) =>
                  updateField("status", (e.target as HTMLSelectElement).value)
                }
              >
                <option value="DRAFT">Draft</option>
                <option value="ACTIVE">Active</option>
              </s-select>
            </s-stack>

            <s-stack direction="inline" gap="base">
              <s-button onClick={addToBatch} variant="primary">
                Add to Batch
              </s-button>
            </s-stack>
          </s-stack>

          {/* ---- Batch Preview ---- */}
          {batch.length > 0 && (
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="base">
                <s-heading>
                  Batch Queue ({batch.length} product
                  {batch.length !== 1 ? "s" : ""})
                </s-heading>

                {batch.map((item, index) => (
                  <s-box
                    key={item.id}
                    padding="base"
                    borderWidth="base"
                    borderRadius="base"
                    background="subdued"
                  >
                    <s-stack direction="inline" gap="base">
                      <s-text>
                        {index + 1}. <strong>{item.title}</strong> —{" "}
                        {item.productType} — ${item.price || "0.00"} —{" "}
                        {item.status}
                      </s-text>
                      <s-button
                        onClick={() => removeFromBatch(item.id)}
                        variant="tertiary"
                        tone="critical"
                      >
                        Remove
                      </s-button>
                    </s-stack>
                  </s-box>
                ))}

                <s-button
                  onClick={createAll}
                  variant="primary"
                  {...(isCreating ? { loading: true } : {})}
                  {...(batch.length === 0 ? { disabled: true } : {})}
                >
                  Create All ({batch.length})
                </s-button>
              </s-stack>
            </s-box>
          )}

          {/* ---- Creation Results ---- */}
          {fetcher.data && "results" in fetcher.data && (
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-heading>Creation Results</s-heading>
              <s-stack direction="block">
                {fetcher?.data?.results?.map((result, index) => (
                  <s-text key={index}>
                    {result.success ? "✅" : "❌"} {result.title}
                    {result.error ? ` — ${result.error}` : ""}
                  </s-text>
                ))}
              </s-stack>
            </s-box>
          )}
        </s-section>
      )}

      {/* ---- Existing Products Table ---- */}
      <s-section heading="Existing Products">
        {products.length === 0 ? (
          <s-paragraph>
            No products yet. Click "Create Products" to get started.
          </s-paragraph>
        ) : (
          <s-box borderWidth="base" borderRadius="base">
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "14px",
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid #e1e3e5",
                    textAlign: "left",
                  }}
                >
                  <th style={{ padding: "12px" }}>Title</th>
                  <th style={{ padding: "12px" }}>Type</th>
                  <th style={{ padding: "12px" }}>Status</th>
                  <th style={{ padding: "12px" }}>Price</th>
                  <th style={{ padding: "12px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr
                    key={product.id}
                    style={{ borderBottom: "1px solid #f1f2f3" }}
                  >
                    <td style={{ padding: "12px" }}>{product.title}</td>
                    <td style={{ padding: "12px" }}>
                      {product.productType || "—"}
                    </td>
                    <td style={{ padding: "12px" }}>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          background:
                            product.status === "ACTIVE" ? "#aee9d1" : "#e4e5e7",
                          color:
                            product.status === "ACTIVE" ? "#0d5e38" : "#616161",
                        }}
                      >
                        {product.status}
                      </span>
                    </td>
                    <td style={{ padding: "12px" }}>
                      $
                      {parseFloat(
                        product.priceRangeV2?.minVariantPrice?.amount ?? "0",
                      ).toFixed(2)}
                    </td>
                    <td style={{ padding: "12px" }}>
                      <s-button
                        onClick={() => {
                          // Extract numeric ID for variant page
                          const numericId = product.id.split("/").pop();
                          window.open(
                            `/app/products/${numericId}/variants`,
                            "_self",
                          );
                        }}
                        variant="tertiary"
                      >
                        Variants
                      </s-button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </s-box>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
