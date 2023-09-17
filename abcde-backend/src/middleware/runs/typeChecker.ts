import { parseAllErrors } from './mypyParsing';

export function parseAndTypeCheck(message, code, codeJson) {
  const typeCheckResults = parseAllErrors(message);
  return typeCheck(typeCheckResults, code, codeJson);
}

export function typeCheck(typeCheckResults, code, codeJson) {
  const codeSplit = code.split('\n');

  const output = {};
  for (const t of typeCheckResults) {
    if (t.code === 'argType') {
      parseArgTypeError(t, codeSplit, codeJson, output);
    } else if (t.code === 'missingArgs') {
      parseMissingOrUnexpecedArgError(t, codeSplit, codeJson, output, true);
    } else if (t.code === 'unexpectedKeywordArg') {
      parseMissingOrUnexpecedArgError(t, codeSplit, codeJson, output, false);
    }
  }
  console.log('output', output);
  return output;
}

function parseArgTypeError(error, codeSplit, codeJson, output) {
  const problemVar = codeSplit[parseInt(error.line) - 1].slice(
    parseInt(error.column) - 1,
    parseInt(error.endColumn),
  );
  setMessage(codeJson, problemVar, output, error.message);
}

function parseMissingOrUnexpecedArgError(
  error,
  codeSplit,
  codeJson,
  output,
  missing,
) {
  console.log('error.badVars', error.badVars);
  const problemVar = codeSplit[parseInt(error.line) - 1].split('=')[0];
  const params =
    codeJson[problemVar].value[missing ? 'unusedParams' : 'params'];
  for (const p of params) {
    if (error.badVars.includes(codeJson[p].name)) {
      setMessage(codeJson, p, output, error.message);
    }
  }
}

function setMessage(codeJson, problemVar, output, message) {
  console.log('setMessage', problemVar);
  const { sectionId, paramInfoId } = codeJson[problemVar];
  if (!(sectionId in output)) {
    output[sectionId] = {};
  }
  if (!(paramInfoId in output[sectionId])) {
    output[sectionId][paramInfoId] = [];
  }
  output[sectionId][paramInfoId].push(message);
}
