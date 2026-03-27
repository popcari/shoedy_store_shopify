/**
 * GraphQL queries and mutations for Product management
 */

/** Query to fetch products list with pagination */
export const PRODUCTS_QUERY = `#graphql
  query ProductsList($first: Int!, $after: String) {
    products(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
      nodes {
        id
        title
        handle
        status
        productType
        vendor
        totalInventory
        priceRangeV2 {
          minVariantPrice {
            amount
            currencyCode
          }
          maxVariantPrice {
            amount
            currencyCode
          }
        }
        featuredImage {
          url
          altText
        }
        variants(first: 5) {
          nodes {
            id
            title
            price
          }
        }
        createdAt
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/** Mutation to create a single product */
export const PRODUCT_CREATE_MUTATION = `#graphql
  mutation ProductCreate($product: ProductCreateInput!) {
    productCreate(product: $product) {
      product {
        id
        title
        handle
        status
        productType
        vendor
        variants(first: 10) {
          edges {
            node {
              id
              price
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/** Mutation to update variant price after product creation */
export const VARIANT_UPDATE_MUTATION = `#graphql
  mutation VariantUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants {
        id
        price
      }
      userErrors {
        field
        message
      }
    }
  }
`;
