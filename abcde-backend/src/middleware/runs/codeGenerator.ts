import {
  DICT_ROOT,
  FN,
  LIST_ROOT,
  REF,
  SECTION,
  SLIDER,
  SWITCH,
  TEXT,
} from 'abcde-utils/src/constants';

export function getImportText(x) {
  const splitName = x.split('.');
  if (splitName.length > 1) {
    splitName.pop();
  }
  const moduleName = splitName.join('.');
  return `import ${moduleName}`;
}

function getImport(x) {
  if (x.type === SECTION) {
    if (!x.value.callable) {
      return null;
    }
    return getImportText(x.value.callable);
  }
  return null;
}

function getDictContents(varNames, selected) {
  const dictContents = varNames.map((v) => `${selected[v].name}: ${v}`);
  return dictContents.join(',');
}

function getCallableParams(varNames, selected) {
  const params = varNames.map((v) => `${selected[v].name}=${v}`);
  return params.join(', ');
}

function getBoolean(value) {
  return value ? 'True' : 'False';
}

function createVarDeclaration(varName, x, selected) {
  const left = `${varName}=`;
  const right = `${getValue(x, selected)}`;
  const startIdx = left.length;
  const endIdx = startIdx + right.length;
  return `${left}${right}`;
}

// x is the details of a var
function getValue(x, selected) {
  switch (x.type) {
    case TEXT:
    case SLIDER:
      return `${x.value}`;
    case SWITCH:
      return `${getBoolean(x.value)}`;
    case SECTION:
    case FN:
      if (!x.value.callable) {
        return `{${getDictContents(x.value.params, selected)}}`;
      } else {
        return `${x.value.callable}(${getCallableParams(
          x.value.params,
          selected,
        )})`;
      }
    case LIST_ROOT:
      return `[${x.value.toString()}]`;
    case DICT_ROOT:
      return `{${getDictContents(x.value, selected)}}`;
    case REF:
      return `${x.value}`;
    default:
      return null;
  }
}

// ordering of variables does not need to be considered
// because they are inserted into selected in the correct order
export function generateCode(selected) {
  const lines: string[] = [];
  const imports = new Set();
  const locations = [];
  for (const [varName, x] of Object.entries(selected)) {
    const varStr = createVarDeclaration(varName, x, selected);
    varStr && lines.push(varStr);
    const importStr = getImport(x);
    importStr && imports.add(importStr);
  }
  const finalArray = [...Array.from(imports), '\n', ...lines];
  return finalArray.join('\n');
}
