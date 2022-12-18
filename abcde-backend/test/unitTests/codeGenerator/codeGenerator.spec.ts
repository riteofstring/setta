import { generateCode } from 'src/actions/codeGenerator/codeGenerator';
import example1 from './example1';

test('generateCode', () => {
  const code = generateCode(example1);
  console.log(code);
});
