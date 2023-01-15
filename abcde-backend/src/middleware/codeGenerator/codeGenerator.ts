import {
  DICT_ROOT,
  LIST_ROOT,
  REF,
  SECTION,
  SLIDER,
  SWITCH,
  TEXT,
} from 'abcde-utils/src/constants';

function getImport(x) {
  if (x.type === SECTION) {
    if (!x.value.callable) {
      return null;
    }
    const splitName = x.value.callable.split('.');
    if (splitName.length > 1) {
      splitName.pop();
    }
    const moduleName = splitName.join('.');
    return `import ${moduleName}`;
  }
  return null;
}

function getDictContents(ids, selected) {
  const dictContents = ids.map((v) => `${selected[v].name}: ${v}`);
  return dictContents.join(',');
}

function getCallableParams(ids, selected) {
  const params = ids.map((v) => `${selected[v].name}=${v}`);
  return params.join(', ');
}

// x is the details of a var
function getVarDeclaration(varName, x, selected) {
  switch (x.type) {
    case TEXT:
      return `${varName} = "${x.value}"`;
    case SLIDER:
      return `${varName} = ${x.value}`;
    case SWITCH:
      return `${varName} = ${x.value}`;
    case SECTION:
      if (!x.value.callable) {
        return `${varName} = {${getDictContents(x.value.params, selected)}}`;
      } else {
        return `${varName} = ${x.value.callable}(${getCallableParams(
          x.value.params,
          selected,
        )})`;
      }
    case LIST_ROOT:
      return `${varName} = [${x.value.toString()}]`;
    case DICT_ROOT:
      return `${varName} = {${getDictContents(x.value, selected)}}`;
    case REF:
      return `${varName} = ${x.value}`;
    default:
      return null;
  }
}

// ordering of variables does not need to be considered
// because they are inserted into selected in the correct order
export function generateCode(selected) {
  const lines: string[] = [];
  const imports = new Set();
  for (const [varName, x] of Object.entries(selected)) {
    const varStr = getVarDeclaration(varName, x, selected);
    varStr && lines.push(varStr);
    const importStr = getImport(x);
    importStr && imports.add(importStr);
  }
  const finalArray = [...Array.from(imports), '\n', ...lines];
  return finalArray.join('\n');
}
