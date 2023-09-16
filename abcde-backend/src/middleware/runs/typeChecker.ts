export function typeCheck(typeCheckResults, code, codeJson) {
  const codeSplit = code.split('\n');

  const output = {};
  for (const t of typeCheckResults) {
    if (t.code === 'arg-type') {
      parseArgTypeError(t, codeSplit, codeJson, output);
    } else if (t.code === 'call-arg') {
      parseCallArgError(t, codeSplit, codeJson, output);
    }
  }
  return output;
}

function parseArgTypeError(error, codeSplit, codeJson, output) {
  const problemVar = codeSplit[parseInt(error.line) - 1].slice(
    parseInt(error.column) - 1,
    parseInt(error.endColumn),
  );
  setMessage(codeJson, problemVar, output, error.message);
}

function parseCallArgError(error, codeSplit, codeJson, output) {
  const problemVar = codeSplit[parseInt(error.line) - 1].split('=')[0];
  const unusedParams = codeJson[problemVar].value.unusedParams;
  for (const p of unusedParams) {
    if (error.missing.includes(codeJson[p].name)) {
      setMessage(codeJson, p, output, error.message);
    }
  }
}

function setMessage(codeJson, problemVar, output, message) {
  const { sectionId, paramInfoId } = codeJson[problemVar];
  if (!(sectionId in output)) {
    output[sectionId] = {};
  }
  output[sectionId][paramInfoId] = message;
}
