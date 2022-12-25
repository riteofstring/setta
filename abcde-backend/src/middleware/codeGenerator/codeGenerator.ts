import { OBJ, REF, STRING, VARIABLE } from 'abcde-utils/src/codeGenConstants';
import _ from 'lodash';

class Variable {
  name: string;
  originalName: string;
  type: string;
  datatype: string;
  value: any;
  childVarNames: any[];
  str?: string;

  constructor(name, originalName, type, datatype, value, allVars) {
    this.name = name;
    this.originalName = originalName;
    this.type = type;
    this.datatype = datatype;
    this.value = isPrimitive(this.datatype) ? value : undefined;
    this.childVarNames =
      this.datatype === 'reference' ? [this.value] : createVars(value, allVars);
  }

  primitiveString() {
    if (this.datatype === 'reference') {
      return this.value;
    } else if (_.isString(this.value)) {
      return `"${this.value}"`;
    } else if (_.isBoolean(this.value)) {
      return this.value ? 'True' : 'False';
    } else if (_.isNull(this.value)) {
      return 'None';
    } else {
      return this.value;
    }
  }

  arrayString() {
    return `[${this.childVarNames.join(', ')}]`;
  }

  objectString(allVars) {
    // If child is callable, then just return child var name
    // because the callable str is fully constructed in the child.
    if (this.childVarNames.length === 1) {
      const curr = allVars[this.childVarNames[0]];
      if (curr.datatype === 'callable') {
        return curr.name;
      }
    }

    // Otherwise we're dealing with an object (dict)
    const childStrs = [] as any;
    for (const k of this.childVarNames) {
      const curr = allVars[k];
      curr.createString(allVars);
      childStrs.push(`"${curr.originalName}": ${curr.name}`);
    }
    return `{${childStrs.join(', ')}}`;
  }

  callableString(allVars) {
    const childStrs = [] as any;
    for (const k of this.childVarNames) {
      const curr = allVars[k];
      curr.createString(allVars);
      childStrs.push(`${curr.originalName}=${curr.name}`);
    }
    return `${this.originalName}(${childStrs.join(', ')})`;
  }

  createString(allVars) {
    if (this.str !== undefined) {
      return;
    }
    let valueStr = '';
    if (isPrimitive(this.datatype)) {
      valueStr = this.primitiveString();
    } else if (this.datatype === 'array') {
      valueStr = this.arrayString();
    } else if (this.datatype === 'object') {
      valueStr = this.objectString(allVars);
    } else if (this.datatype === 'callable') {
      valueStr = this.callableString(allVars);
    }
    const varName = this.type === VARIABLE ? this.originalName : this.name;
    this.str = `${varName} = ${valueStr}`;
  }

  addToQueue(allVars, queue) {
    this.childVarNames.forEach((k) => allVars[k].addToQueue(allVars, queue));
    queue.push(this.str);
  }

  addImport(allImports) {
    if (this.datatype === 'callable') {
      const splitName = this.originalName.split('.');
      splitName.pop();
      const moduleName = splitName.join('.');
      allImports.push(`import ${moduleName}`);
    }
  }
}

// https://stackoverflow.com/a/1349426
function randomString(length) {
  let result = '';
  const characters = 'abcdefghijklmnopqrstuvwxyz';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

function genVarName(allVars) {
  let newVar;
  do {
    newVar = randomString(3);
  } while (newVar in allVars);
  return newVar;
}

// Anything that doesn't have more variables inside
// i.e., strings, numbers, booleans, references
function isPrimitive(datatype) {
  return ['string', 'reference', 'primitive'].includes(datatype);
}

function getDatatype(varType, value) {
  let datatype;
  let trueValue = value;
  if (Array.isArray(value)) {
    datatype = 'array';
  } else if (_.isObject(value)) {
    if (varType === OBJ) {
      datatype = 'callable';
    } else {
      datatype = 'object';
    }
  } else if (_.isString(value)) {
    [datatype, trueValue] = splitTypeStr(value);
    if (datatype === STRING) {
      datatype = 'string';
    } else if (datatype === REF) {
      datatype = 'reference';
    }
  } else {
    datatype = 'primitive';
  }
  return [datatype, trueValue];
}

function splitTypeStr(key) {
  return [key.slice(0, 2), key.slice(2)];
}

function createVar(key, value, allVars) {
  const [varType, trueKey] = splitTypeStr(key);
  const [datatype, trueValue] = getDatatype(varType, value);
  const varName = varType === VARIABLE ? trueKey : genVarName(allVars);
  return new Variable(varName, trueKey, varType, datatype, trueValue, allVars);
}

function addChildVarName(key, value, allVars, childVarNames) {
  const newVar = createVar(key, value, allVars);
  const newVarName = newVar.name;
  allVars[newVarName] = newVar;
  childVarNames.push(newVarName);
}

function addChildVarNamesFromArray(x, allVars) {
  const childVarNames = [];
  for (let i = 0; i < x.length; i++) {
    addChildVarName(`P~${i}`, x[i], allVars, childVarNames);
  }
  return childVarNames;
}

function addChildVarNamesFromObject(x, allVars) {
  const childVarNames = [];
  for (const [k, v] of Object.entries(x)) {
    addChildVarName(k, v, allVars, childVarNames);
  }
  return childVarNames;
}

// returns list of child variable names
function createVars(x, allVars) {
  if ((Array.isArray(x) && x.length === 0) || !_.isObject(x)) {
    return [];
  } else if (Array.isArray(x)) {
    return addChildVarNamesFromArray(x, allVars);
  } else {
    return addChildVarNamesFromObject(x, allVars);
  }
}

function createStringWithoutDuplicates(listOfStrings) {
  const strSet = new Set();
  const output = [] as any;
  for (const v of listOfStrings) {
    if (!strSet.has(v)) {
      output.push(v);
      strSet.add(v);
    }
  }
  return output.join('\n');
}

export function generateCode(selected) {
  const allVars: { [key: string]: Variable } = {};
  createVars(selected, allVars);
  for (const v of Object.values(allVars)) {
    v.createString(allVars);
  }

  const allImports = [];
  const queue = [];
  for (const v of Object.values(allVars)) {
    v.addImport(allImports);
    v.addToQueue(allVars, queue);
  }

  const importStr = createStringWithoutDuplicates(allImports);
  const codeStr = createStringWithoutDuplicates(queue);
  const outputStr = `${importStr}\n\n${codeStr}`;

  // console.log("allVars\n", allVars);
  // console.log("queue\n", queue);
  return outputStr;
}

// Assign every ~V, ~O, and ~P to a global variable namespace
// When creating a variable, create its children variables and keep track of those variables, i.e. make a tree of the variables
// The code starts with all necessary imports, and then creates variable assignments doing a bottom-up traversal of the tree

// if it's a string, number, boolean, or null, then the var has no children
// if it's an object, then the number of children is the number of keys in the object
// if it's an array, then the number of children i
