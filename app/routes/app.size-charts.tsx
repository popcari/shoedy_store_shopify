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
  SIZE_CHARTS_QUERY,
  SIZE_CHART_DELETE_MUTATION,
  SIZE_CHART_UPSERT_MUTATION,
} from "../graphql/size-chart-queries";
import { authenticate } from "../shopify.server";

// ---------- Types ----------
interface SizeRow {
  us: string;
  eu: string;
  uk: string;
  cm: string;
}

interface SizeChart {
  id: string;
  handle: string;
  name: { value: string } | null;
  sizes: { value: string } | null;
  updatedAt: string;
}

// ---------- Server ----------
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(SIZE_CHARTS_QUERY, {
    variables: { first: 50 },
  });
  const data = await response.json();

  return {
    sizeCharts: (data.data?.metaobjects?.nodes ?? []) as SizeChart[],
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "create" || intent === "update") {
    const name = formData.get("name") as string;
    const sizes = formData.get("sizes") as string;
    const handle =
      intent === "update"
        ? (formData.get("handle") as string)
        : name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    const response = await admin.graphql(SIZE_CHART_UPSERT_MUTATION, {
      variables: {
        handle: {
          type: "$app:size_chart",
          handle,
        },
        metaobject: {
          fields: [
            { key: "name", value: name },
            { key: "sizes", value: sizes },
          ],
        },
      },
    });

    const data = await response.json();
    const userErrors = data.data?.metaobjectUpsert?.userErrors ?? [];

    if (userErrors.length > 0) {
      return {
        intent,
        success: false,
        error: userErrors.map((e: { message: string }) => e.message).join(", "),
      };
    }

    return {
      intent,
      success: true,
      chart: data.data?.metaobjectUpsert?.metaobject,
    };
  }

  if (intent === "delete") {
    const id = formData.get("chartId") as string;

    const response = await admin.graphql(SIZE_CHART_DELETE_MUTATION, {
      variables: { id },
    });
    const data = await response.json();
    const userErrors = data.data?.metaobjectDelete?.userErrors ?? [];

    if (userErrors.length > 0) {
      return {
        intent,
        success: false,
        error: userErrors.map((e: { message: string }) => e.message).join(", "),
      };
    }

    return { intent, success: true };
  }

  return { intent: "unknown", success: false };
};

// ---------- Constants ----------
const EMPTY_SIZE_ROW: SizeRow = { us: "", eu: "", uk: "", cm: "" };

const DEFAULT_SIZES: SizeRow[] = [
  { us: "6", eu: "38", uk: "5", cm: "24" },
  { us: "7", eu: "40", uk: "6", cm: "25" },
  { us: "8", eu: "41", uk: "7", cm: "26" },
  { us: "9", eu: "42", uk: "8", cm: "27" },
  { us: "10", eu: "43", uk: "9", cm: "28" },
  { us: "11", eu: "44", uk: "10", cm: "29" },
  { us: "12", eu: "46", uk: "11", cm: "30" },
];

// ---------- Component ----------
export default function SizeChartsPage() {
  const { sizeCharts } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [showForm, setShowForm] = useState(false);
  const [chartName, setChartName] = useState("");
  const [sizeRows, setSizeRows] = useState<SizeRow[]>([{ ...EMPTY_SIZE_ROW }]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [editingHandle, setEditingHandle] = useState<string | null>(null);

  const isSubmitting = fetcher.state !== "idle";

  // Handle results
  useEffect(() => {
    if (fetcher.data?.success) {
      if (fetcher.data.intent === "create") {
        shopify.toast.show("Size chart created!");
        resetForm();
      } else if (fetcher.data.intent === "update") {
        shopify.toast.show("Size chart updated!");
        resetForm();
      } else if (fetcher.data.intent === "delete") {
        shopify.toast.show("Size chart deleted");
      }
    } else if (fetcher.data && !fetcher.data.success && fetcher.data.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const resetForm = useCallback(() => {
    setChartName("");
    setSizeRows([{ ...EMPTY_SIZE_ROW }]);
    setShowForm(false);
    setEditingHandle(null);
    setErrors({});
  }, []);

  const addRow = useCallback(() => {
    setSizeRows((prev) => [...prev, { ...EMPTY_SIZE_ROW }]);
  }, []);

  const removeRow = useCallback((index: number) => {
    setSizeRows((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateRow = useCallback(
    (index: number, field: keyof SizeRow, value: string) => {
      setSizeRows((prev) =>
        prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
      );
    },
    [],
  );

  const loadDefaults = useCallback(() => {
    setSizeRows([...DEFAULT_SIZES]);
  }, []);

  const editChart = useCallback((chart: SizeChart) => {
    setChartName(chart.name?.value ?? "");
    try {
      const parsed = JSON.parse(chart.sizes?.value ?? "[]");
      setSizeRows(parsed.length > 0 ? parsed : [{ ...EMPTY_SIZE_ROW }]);
    } catch {
      setSizeRows([{ ...EMPTY_SIZE_ROW }]);
    }
    setEditingHandle(chart.handle);
    setShowForm(true);
  }, []);

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    if (!chartName.trim()) {
      newErrors.name = "Chart name is required";
    }
    const validRows = sizeRows.filter((r) => r.us || r.eu || r.uk || r.cm);
    if (validRows.length === 0) {
      newErrors.sizes = "At least one size row is required";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [chartName, sizeRows]);

  const handleSubmit = useCallback(() => {
    if (!validate()) return;

    const validRows = sizeRows.filter((r) => r.us || r.eu || r.uk || r.cm);

    const formData = new FormData();
    formData.append("intent", editingHandle ? "update" : "create");
    formData.append("name", chartName.trim());
    formData.append("sizes", JSON.stringify(validRows));
    if (editingHandle) {
      formData.append("handle", editingHandle);
    }

    fetcher.submit(formData, { method: "POST" });
  }, [chartName, sizeRows, editingHandle, validate, fetcher]);

  const deleteChart = useCallback(
    (chartId: string) => {
      const formData = new FormData();
      formData.append("intent", "delete");
      formData.append("chartId", chartId);
      fetcher.submit(formData, { method: "POST" });
    },
    [fetcher],
  );

  return (
    <s-page heading="Size Charts">
      <s-button
        slot="primary-action"
        onClick={() => {
          if (showForm) {
            resetForm();
          } else {
            setShowForm(true);
          }
        }}
      >
        {showForm ? "Cancel" : "Create Size Chart"}
      </s-button>

      {/* ---- Create/Edit Form ---- */}
      {showForm && (
        <s-section
          heading={editingHandle ? "Edit Size Chart" : "Create Size Chart"}
        >
          <s-stack direction="block" gap="base">
            <s-text-field
              label="Chart Name *"
              value={chartName}
              onInput={(e: Event) => {
                setChartName((e.target as HTMLInputElement).value);
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.name;
                  return next;
                });
              }}
              {...(errors.name ? { error: errors.name } : {})}
            />

            <s-stack direction="inline" gap="base">
              <s-button onClick={loadDefaults} variant="tertiary">
                Load Default Sizes
              </s-button>
              <s-button onClick={addRow} variant="tertiary">
                + Add Row
              </s-button>
            </s-stack>

            {errors.sizes && <s-text tone="critical">{errors.sizes}</s-text>}

            {/* Size rows table */}
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
                    <th style={{ padding: "10px" }}>US</th>
                    <th style={{ padding: "10px" }}>EU</th>
                    <th style={{ padding: "10px" }}>UK</th>
                    <th style={{ padding: "10px" }}>CM</th>
                    <th style={{ padding: "10px", width: "60px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {sizeRows.map((row, index) => (
                    <tr
                      key={index}
                      style={{ borderBottom: "1px solid #f1f2f3" }}
                    >
                      {(["us", "eu", "uk", "cm"] as const).map((field) => (
                        <td key={field} style={{ padding: "6px 10px" }}>
                          <input
                            type="text"
                            value={row[field]}
                            onChange={(e) =>
                              updateRow(index, field, e.target.value)
                            }
                            placeholder={field.toUpperCase()}
                            style={{
                              width: "100%",
                              padding: "6px 8px",
                              border: "1px solid #c9cccf",
                              borderRadius: "6px",
                              fontSize: "14px",
                            }}
                          />
                        </td>
                      ))}
                      <td style={{ padding: "6px 10px" }}>
                        {sizeRows.length > 1 && (
                          <s-button
                            onClick={() => removeRow(index)}
                            variant="tertiary"
                            tone="critical"
                          >
                            ✕
                          </s-button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </s-box>

            <s-button
              onClick={handleSubmit}
              variant="primary"
              {...(isSubmitting ? { loading: true } : {})}
            >
              {editingHandle ? "Update Size Chart" : "Create Size Chart"}
            </s-button>
          </s-stack>
        </s-section>
      )}

      {/* ---- Existing Size Charts ---- */}
      <s-section heading="Your Size Charts">
        {sizeCharts.length === 0 ? (
          <s-paragraph>
            No size charts yet. Click "Create Size Chart" to get started.
          </s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {sizeCharts.map((chart) => {
              let sizes: SizeRow[] = [];
              try {
                sizes = JSON.parse(chart.sizes?.value ?? "[]");
              } catch {
                sizes = [];
              }

              return (
                <s-box
                  key={chart.id}
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                >
                  <s-stack direction="block">
                    <s-stack direction="inline" gap="base">
                      <s-heading>{chart.name?.value ?? "Untitled"}</s-heading>
                      <s-button
                        onClick={() => editChart(chart)}
                        variant="tertiary"
                      >
                        Edit
                      </s-button>
                      <s-button
                        onClick={() => deleteChart(chart.id)}
                        variant="tertiary"
                        tone="critical"
                      >
                        Delete
                      </s-button>
                    </s-stack>

                    {sizes.length > 0 && (
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
                              <th style={{ padding: "8px" }}>US</th>
                              <th style={{ padding: "8px" }}>EU</th>
                              <th style={{ padding: "8px" }}>UK</th>
                              <th style={{ padding: "8px" }}>CM</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sizes.map((size, i) => (
                              <tr
                                key={i}
                                style={{
                                  borderBottom: "1px solid #f1f2f3",
                                }}
                              >
                                <td style={{ padding: "8px" }}>{size.us}</td>
                                <td style={{ padding: "8px" }}>{size.eu}</td>
                                <td style={{ padding: "8px" }}>{size.uk}</td>
                                <td style={{ padding: "8px" }}>{size.cm}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </s-box>
                    )}
                  </s-stack>
                </s-box>
              );
            })}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
