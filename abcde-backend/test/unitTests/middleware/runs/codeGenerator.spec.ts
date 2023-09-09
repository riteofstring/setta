import { generateCode } from 'src/middleware/runs/codeGenerator';

const fs = require('fs');

describe('Generate code from output of exportSelected', () => {
  test('Register', () => {
    const codeJson = JSON.parse(
      fs.readFileSync('test/unitTests/middleware/runs/testJson.json', 'utf8'),
    );
    // console.log(codeJson);
    const code = generateCode(codeJson);
    console.log(code);
  });
});
