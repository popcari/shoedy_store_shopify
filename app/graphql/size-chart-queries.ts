/**
 * GraphQL queries and mutations for Size Chart management (Metaobjects)
 */

/** Query to fetch all size chart metaobjects */
export const SIZE_CHARTS_QUERY = `#graphql
  query SizeCharts($first: Int!) {
    metaobjects(type: "$app:size_chart", first: $first, sortKey: "updated_at") {
      nodes {
        id
        handle
        name: field(key: "name") {
          value
        }
        sizes: field(key: "sizes") {
          value
        }
        updatedAt
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/** Mutation to create/update a size chart metaobject */
export const SIZE_CHART_UPSERT_MUTATION = `#graphql
  mutation SizeChartUpsert($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
    metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
      metaobject {
        id
        handle
        name: field(key: "name") {
          value
        }
        sizes: field(key: "sizes") {
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/** Mutation to delete a size chart metaobject */
export const SIZE_CHART_DELETE_MUTATION = `#graphql
  mutation SizeChartDelete($id: ID!) {
    metaobjectDelete(id: $id) {
      deletedId
      userErrors {
        field
        message
      }
    }
  }
`;
