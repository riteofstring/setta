/** @type {import('@hey-api/openapi-ts').UserConfig} */
export default {
  input: "generation/non_http_shared/openapi.json",
  output: "src/openapi/non_http/generated",
  plugins: [
    {
      name: "@hey-api/typescript",
      definitions: {
        case: "preserve",
        name: "{{name}}",
      },
      enums: {
        enabled: false,
      },
    },
  ],
};
