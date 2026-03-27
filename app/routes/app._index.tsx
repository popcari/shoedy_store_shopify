import { boundary } from "@shopify/shopify-app-react-router/server";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  // Fetch quick stats
  const response = await admin.graphql(
    `#graphql
      query DashboardStats {
        products(first: 1) {
          nodes { id }
          pageInfo { hasNextPage }
        }
        productsCount {
          count
        }
      }
    `,
  );

  const data = await response.json();

  return {
    productCount: data.data?.productsCount?.count ?? 0,
  };
};

export default function Index() {
  const { productCount } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Shoedy Store">
      <s-section heading="Welcome to Shoedy 👟">
        <s-paragraph>
          Your shoe store management app. Use the navigation to manage products,
          size charts, and more.
        </s-paragraph>
      </s-section>

      <s-section heading="Quick Stats">
        <s-stack direction="inline" gap="base">
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="large"
            background="subdued"
          >
            <s-stack direction="block">
              <s-text>{productCount}</s-text>
              <s-text>Total Products</s-text>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>

      <s-section heading="Quick Actions">
        <s-stack direction="inline" gap="base">
          <s-button href="/app/products">Manage Products</s-button>
          <s-button href="/app/size-charts" variant="secondary">
            Size Charts
          </s-button>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="App Info">
        <s-paragraph>
          <s-text>Framework: </s-text>
          <s-link href="https://reactrouter.com/" target="_blank">
            React Router
          </s-link>
        </s-paragraph>
        <s-paragraph>
          <s-text>API: </s-text>
          <s-link
            href="https://shopify.dev/docs/api/admin-graphql"
            target="_blank"
          >
            Admin GraphQL
          </s-link>
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
