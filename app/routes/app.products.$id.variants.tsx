import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useParams } from "react-router";
import {
  PRODUCT_WITH_VARIANTS_QUERY,
  VARIANTS_BULK_CREATE_MUTATION,
} from "../graphql/variant-queries";
import { authenticate } from "../shopify.server";

// ---------- Types ----------
interface ProductOption {
  id: string;
  name: string;
  values: string[];
}

interface VariantNode {
  id: string;
  title: string;
  price: string;
  selectedOptions: Array<{ name: string; value: string }>;
  inventoryQuantity: number;
}

interface VariantCombination {
  color: string;
  size: string;
  price: string;
  selected: boolean;
}

// ---------- Server ----------
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const productId = `gid://shopify/Product/${params.id}`;

  const response = await admin.graphql(PRODUCT_WITH_VARIANTS_QUERY, {
    variables: { id: productId },
  });
  const data = await response.json();

  return {
    product: data.data?.product ?? null,
    existingVariants: (data.data?.product?.variants?.nodes ??
      []) as VariantNode[],
    existingOptions: (data.data?.product?.options ?? []) as ProductOption[],
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const productId = `gid://shopify/Product/${params.id}`;

  if (intent === "generate-variants") {
    const combinationsJson = formData.get("combinations") as string;
    const combinations: VariantCombination[] = JSON.parse(combinationsJson);

    // Only process selected combinations
    const selected = combinations.filter((c) => c.selected);

    if (selected.length === 0) {
      return { success: false, error: "No variants selected" };
    }

    // Build variants input
    const variants = selected.map((combo) => ({
      price: combo.price || "0.00",
      optionValues: [
        { optionName: "Color", name: combo.color },
        { optionName: "Size", name: combo.size },
      ],
    }));

    try {
      const response = await admin.graphql(VARIANTS_BULK_CREATE_MUTATION, {
        variables: {
          productId,
          strategy: "REMOVE_STANDALONE_VARIANT",
          variants,
        },
      });

      const data = await response.json();
      const userErrors = data.data?.productVariantsBulkCreate?.userErrors ?? [];

      if (userErrors.length > 0) {
        return {
          success: false,
          error: userErrors
            .map((e: { message: string }) => e.message)
            .join(", "),
        };
      }

      return {
        success: true,
        createdCount:
          data.data?.productVariantsBulkCreate?.productVariants?.length ?? 0,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  return { success: false, error: "Unknown intent" };
};

// ---------- Constants ----------
const SHOE_COLORS = [
  "Black",
  "White",
  "Red",
  "Blue",
  "Navy",
  "Brown",
  "Grey",
  "Green",
  "Pink",
  "Beige",
];

const SHOE_SIZES = [
  "US 5",
  "US 6",
  "US 7",
  "US 8",
  "US 9",
  "US 10",
  "US 11",
  "US 12",
  "US 13",
];

// ---------- Component ----------
export default function VariantGeneratorPage() {
  const { product, existingVariants } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const params = useParams();

  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [basePrice, setBasePrice] = useState("");
  const [combinations, setCombinations] = useState<VariantCombination[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isGenerating = fetcher.state !== "idle";

  // Handle results
  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show(
        `${(fetcher.data as { createdCount: number }).createdCount} variant(s) created!`,
      );
      setCombinations([]);
      setSelectedColors([]);
      setSelectedSizes([]);
    } else if (fetcher.data && !fetcher.data.success && fetcher.data.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  // Generate combinations when colors/sizes change
  const generateCombinations = useCallback(() => {
    const newErrors: Record<string, string> = {};
    if (selectedColors.length === 0) {
      newErrors.colors = "Select at least one color";
    }
    if (selectedSizes.length === 0) {
      newErrors.sizes = "Select at least one size";
    }

    const totalCount = selectedColors.length * selectedSizes.length;
    if (totalCount > 100) {
      newErrors.total = `Too many variants (${totalCount}). Shopify limit is 100.`;
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    const combos: VariantCombination[] = [];
    for (const color of selectedColors) {
      for (const size of selectedSizes) {
        combos.push({
          color,
          size,
          price: basePrice || "0.00",
          selected: true,
        });
      }
    }
    setCombinations(combos);
  }, [selectedColors, selectedSizes, basePrice]);

  const toggleColor = useCallback((color: string) => {
    setSelectedColors((prev) =>
      prev.includes(color) ? prev.filter((c) => c !== color) : [...prev, color],
    );
  }, []);

  const toggleSize = useCallback((size: string) => {
    setSelectedSizes((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size],
    );
  }, []);

  const toggleCombination = useCallback((index: number) => {
    setCombinations((prev) =>
      prev.map((c, i) => (i === index ? { ...c, selected: !c.selected } : c)),
    );
  }, []);

  const updateCombinationPrice = useCallback((index: number, price: string) => {
    setCombinations((prev) =>
      prev.map((c, i) => (i === index ? { ...c, price } : c)),
    );
  }, []);

  const selectedCount = useMemo(
    () => combinations.filter((c) => c.selected).length,
    [combinations],
  );

  const submitVariants = useCallback(() => {
    if (selectedCount === 0) {
      shopify.toast.show("No variants selected", { isError: true });
      return;
    }

    const formData = new FormData();
    formData.append("intent", "generate-variants");
    formData.append("combinations", JSON.stringify(combinations));
    fetcher.submit(formData, { method: "POST" });
  }, [combinations, selectedCount, fetcher, shopify]);

  if (!product) {
    return (
      <s-page heading="Product Not Found">
        <s-section>
          <s-paragraph>Could not find product with ID {params.id}.</s-paragraph>
          <s-button href="/app/products">Back to Products</s-button>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading={`Variants: ${product.title}`}>
      <s-button slot="primary-action" href="/app/products">
        Back to Products
      </s-button>

      {/* ---- Existing Variants ---- */}
      {existingVariants.length > 0 && (
        <s-section heading={`Current Variants (${existingVariants.length})`}>
          <s-box borderWidth="base" borderRadius="base">
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "13px",
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid #e1e3e5",
                    textAlign: "left",
                  }}
                >
                  <th style={{ padding: "10px" }}>Variant</th>
                  <th style={{ padding: "10px" }}>Price</th>
                  <th style={{ padding: "10px" }}>Inventory</th>
                </tr>
              </thead>
              <tbody>
                {existingVariants.map((variant) => (
                  <tr
                    key={variant.id}
                    style={{ borderBottom: "1px solid #f1f2f3" }}
                  >
                    <td style={{ padding: "10px" }}>{variant.title}</td>
                    <td style={{ padding: "10px" }}>
                      ${parseFloat(variant.price).toFixed(2)}
                    </td>
                    <td style={{ padding: "10px" }}>
                      {variant.inventoryQuantity}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </s-box>
        </s-section>
      )}

      {/* ---- Variant Generator ---- */}
      <s-section heading="Generate New Variants">
        <s-stack direction="block" gap="base">
          {/* Colors */}
          <s-stack direction="block">
            <s-heading>
              Select Colors{" "}
              {selectedColors.length > 0 && `(${selectedColors.length})`}
            </s-heading>
            {errors.colors && <s-text tone="critical">{errors.colors}</s-text>}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {SHOE_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => toggleColor(color)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "20px",
                    border: selectedColors.includes(color)
                      ? "2px solid #2c6ecb"
                      : "1px solid #c9cccf",
                    background: selectedColors.includes(color)
                      ? "#e3f1ff"
                      : "#fff",
                    color: selectedColors.includes(color) ? "#2c6ecb" : "#333",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: selectedColors.includes(color) ? 600 : 400,
                  }}
                >
                  {color}
                </button>
              ))}
            </div>
          </s-stack>

          {/* Sizes */}
          <s-stack direction="block">
            <s-heading>
              Select Sizes{" "}
              {selectedSizes.length > 0 && `(${selectedSizes.length})`}
            </s-heading>
            {errors.sizes && <s-text tone="critical">{errors.sizes}</s-text>}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {SHOE_SIZES.map((size) => (
                <button
                  key={size}
                  onClick={() => toggleSize(size)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "20px",
                    border: selectedSizes.includes(size)
                      ? "2px solid #2c6ecb"
                      : "1px solid #c9cccf",
                    background: selectedSizes.includes(size)
                      ? "#e3f1ff"
                      : "#fff",
                    color: selectedSizes.includes(size) ? "#2c6ecb" : "#333",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: selectedSizes.includes(size) ? 600 : 400,
                  }}
                >
                  {size}
                </button>
              ))}
            </div>
          </s-stack>

          {/* Base Price + Generate */}
          <s-stack direction="inline" gap="base">
            <s-text-field
              label="Base Price ($)"
              value={basePrice}
              onInput={(e: Event) =>
                setBasePrice((e.target as HTMLInputElement).value)
              }
            />
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <s-button onClick={generateCombinations} variant="secondary">
                Preview Combinations (
                {selectedColors.length * selectedSizes.length})
              </s-button>
            </div>
          </s-stack>

          {errors.total && <s-text tone="critical">{errors.total}</s-text>}
        </s-stack>
      </s-section>

      {/* ---- Combinations Preview ---- */}
      {combinations.length > 0 && (
        <s-section
          heading={`Variant Preview (${selectedCount} selected of ${combinations.length})`}
        >
          <s-box borderWidth="base" borderRadius="base">
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "13px",
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid #e1e3e5",
                    textAlign: "left",
                  }}
                >
                  <th style={{ padding: "10px", width: "40px" }}>✓</th>
                  <th style={{ padding: "10px" }}>Color</th>
                  <th style={{ padding: "10px" }}>Size</th>
                  <th style={{ padding: "10px" }}>Price</th>
                </tr>
              </thead>
              <tbody>
                {combinations.map((combo, index) => (
                  <tr
                    key={`${combo.color}-${combo.size}`}
                    style={{
                      borderBottom: "1px solid #f1f2f3",
                      background: combo.selected ? "#fff" : "#f9fafb",
                      opacity: combo.selected ? 1 : 0.5,
                    }}
                  >
                    <td style={{ padding: "10px" }}>
                      <input
                        type="checkbox"
                        checked={combo.selected}
                        onChange={() => toggleCombination(index)}
                      />
                    </td>
                    <td style={{ padding: "10px" }}>{combo.color}</td>
                    <td style={{ padding: "10px" }}>{combo.size}</td>
                    <td style={{ padding: "10px" }}>
                      <input
                        type="number"
                        value={combo.price}
                        onChange={(e) =>
                          updateCombinationPrice(index, e.target.value)
                        }
                        style={{
                          width: "80px",
                          padding: "4px 6px",
                          border: "1px solid #c9cccf",
                          borderRadius: "4px",
                          fontSize: "13px",
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </s-box>

          <s-stack direction="inline" gap="base">
            <s-button
              onClick={submitVariants}
              variant="primary"
              {...(isGenerating ? { loading: true } : {})}
              {...(selectedCount === 0 ? { disabled: true } : {})}
            >
              Generate {selectedCount} Variant{selectedCount !== 1 ? "s" : ""}
            </s-button>
            <s-button onClick={() => setCombinations([])} variant="tertiary">
              Clear
            </s-button>
          </s-stack>
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
