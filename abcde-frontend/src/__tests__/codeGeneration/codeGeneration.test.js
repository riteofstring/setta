import { generateCode } from "codeGeneration/codeGeneration";

import example1 from "./example1.json";

test("generateCode", () => {
  const code = generateCode(example1);
  console.log(code);
});
