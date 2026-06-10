import type { CodegenConfig } from '@graphql-codegen/cli';

/**
 * Generates a typed SDK from the vendored admin schema + the hand-written
 * operation documents in src/operations/. The `typescript-graphql-request`
 * plugin emits `getSdk(client)` exposing ONE typed method per named operation —
 * there is no generic string-query method, which is how "no arbitrary GraphQL"
 * is enforced structurally. Output is gitignored and regenerated (pretest hook).
 */
const config: CodegenConfig = {
  schema: 'schema/schema-v2.graphql',
  documents: 'src/operations/**/*.graphql',
  ignoreNoDocuments: true,
  generates: {
    'src/generated/graphql.ts': {
      plugins: [
        'typescript',
        'typescript-operations',
        'typescript-graphql-request',
      ],
      config: {
        useTypeImports: true,
        documentMode: 'string',
        scalars: {
          DateTime: 'string',
          Date: 'string',
          Time: 'string',
          Slug: 'string',
          Color: 'string',
          JSON: 'unknown',
          JSONObject: 'unknown',
          RichText: 'unknown',
          Upload: 'unknown',
          GraphQLBigInt: 'number',
          Void: 'null',
        },
      },
    },
  },
};

export default config;
