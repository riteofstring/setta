import { generateCode } from 'src/middleware/runs/codeGenerator';
import { parseAndTypeCheck } from 'src/middleware/runs/typeChecker';

const fs = require('fs');

const simple1Error =
  'simple.py:5:37:5:38: error: Argument "weight" to "CrossEntropyLoss" has incompatible type "list[object]"; expected "Tensor | None"  [arg-type]';
const simple2Error =
  'simple.py:4:4:4:27: error: Missing positional argument "size" in call to "CrossMapLRN2d"  [call-arg]';
const simple3Error =
  'simple.py:6:4:6:53: error: Unexpected keyword argument "some_random_arg" for "CrossEntropyLoss"  [call-arg]\nsimple.py:6:37:6:38: error: Argument "weight" to "CrossEntropyLoss" has incompatible type "str"; expected "Tensor | None"  [arg-type]';

describe('Generate code from output of exportSelected', () => {
  test('Register', () => {
    const codeJson = JSON.parse(
      fs.readFileSync('test/unitTests/middleware/runs/simple3.json', 'utf8'),
    );
    const code = generateCode(codeJson);
    console.log(code);
    const output = parseAndTypeCheck(simple3Error, code, codeJson);
    console.log(output);
  });
});
