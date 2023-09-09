export function typeCheck(typeCheckResults, code, codeJson) {
  const codeSplit = code.split('\n');

  const output = {};
  for (const t of typeCheckResults) {
    if (t.type === 'error') {
      const problemVar = codeSplit[parseInt(t.line) - 1].slice(
        parseInt(t.column) - 1,
        parseInt(t.endColumn),
      );
      const { id, sectionId } = codeJson[problemVar];
      output[sectionId] = { id, message: t.message };
    }
  }
  return output;
}
