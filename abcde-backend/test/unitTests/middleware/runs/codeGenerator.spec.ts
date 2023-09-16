import { generateCode } from 'src/middleware/runs/codeGenerator';
import { parseAllErrors } from 'src/middleware/runs/mypyParsing';
import { typeCheck } from 'src/middleware/runs/typeChecker';

const fs = require('fs');

describe('Generate code from output of exportSelected', () => {
  test('Register', () => {
    const codeJson = JSON.parse(
      fs.readFileSync('test/unitTests/middleware/runs/simple2.json', 'utf8'),
    );
    const code = generateCode(codeJson);
    console.log(code);

    const typeCheckResults = JSON.parse(
      fs.readFileSync(
        'test/unitTests/middleware/runs/simple2TypeCheck.json',
        'utf8',
      ),
    );

    const output = typeCheck(typeCheckResults, code, codeJson);
    console.log(output);
  });

  test('mypyParsing', () => {
    const x = parseAllErrors(
      'simple.py:4:1:4:17: error: Missing positional arguments "in_channels", "out_channels", "kernel_size" in call to "Conv2d"  [call-arg]',
    );
    console.log(x);
  });
});
