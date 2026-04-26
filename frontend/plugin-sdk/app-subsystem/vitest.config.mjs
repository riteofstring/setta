import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = dirname(fileURLToPath(import.meta.url));

export default {
  root: packageDir,
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
};
