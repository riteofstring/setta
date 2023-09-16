import { generateCode } from 'src/middleware/runs/codeGenerator';
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
});
