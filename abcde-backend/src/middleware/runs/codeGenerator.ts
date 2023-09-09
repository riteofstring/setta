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

function getMappings(varNames, selected, operator) {
  const mappings = varNames.map((v) =>
    varDeclaration(selected[v].name, v, operator),
  );
  return mappings.join(', ');
}

function getDictContents(varNames, selected) {
  return getMappings(varNames, selected, ':');
}

function getCallableParams(varNames, selected) {
  return getMappings(varNames, selected, '=');
}

function getBoolean(value) {
  return value ? 'True' : 'False';
}

function varDeclaration(varName, value, operator = '=') {
  return `${varName}${operator}${value}`;
}

// x is the details of a var
function getValue(x, selected) {
  switch (x.type) {
    case TEXT:
    case SLIDER:
    case REF:
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
    default:
      return null;
  }
}

function createLine(varName, x, selected) {
  const value = getValue(x, selected);
  return value ? varDeclaration(varName, value) : value;
}

// ordering of variables does not need to be considered
// because they are inserted into selected in the correct order
export function generateCode(selected) {
  const lines: string[] = [];
  const imports = new Set();
  for (const [varName, x] of Object.entries(selected)) {
    const varStr = createLine(varName, x, selected);
    varStr && lines.push(varStr);
    const importStr = getImport(x);
    importStr && imports.add(importStr);
  }
  const finalArray = [...Array.from(imports), '\n', ...lines];
  return finalArray.join('\n');
}
