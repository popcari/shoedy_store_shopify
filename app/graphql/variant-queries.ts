/**
 * GraphQL queries and mutations for Product Variant management
 */

/** Query to fetch a single product with its variants and options */
export const PRODUCT_WITH_VARIANTS_QUERY = `#graphql
  query ProductWithVariants($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      status
      options {
        id
        name
        values
      }
      variants(first: 100) {
        nodes {
          id
          title
          price
          selectedOptions {
            name
            value
          }
          inventoryQuantity
        }
      }
    }
  }
`;

/** Mutation to bulk create variants for a product */
export const VARIANTS_BULK_CREATE_MUTATION = `#graphql
  mutation VariantsBulkCreate($productId: ID!, $strategy: ProductVariantsBulkCreateStrategy, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkCreate(productId: $productId, strategy: $strategy, variants: $variants) {
      productVariants {
        id
        title
        price
        selectedOptions {
          name
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

/** Mutation to set product options (Color, Size) */
export const PRODUCT_OPTIONS_UPDATE_MUTATION = `#graphql
  mutation ProductOptionsUpdate($productId: ID!, $options: [OptionUpdateInput!]!, $newOptions: [OptionCreateInput!]!) {
    productOptionsReorder(productId: $productId, options: $options) {
      userErrors {
        field
        message
      }
    }
    productUpdate(input: { id: $productId }) {
      product {
        id
        options {
          id
          name
          values
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;
