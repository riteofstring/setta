import example1 from "./example1.json";
import {generateCode} from "codeGeneration/codeGeneration"

test("generateCode", () => {
  const code = generateCode(example1)
  console.log(code)
});
