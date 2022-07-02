import _ from "lodash";

const VARIABLE = "V~"; // top level variable names
const OBJ = "O~"; // callables
const PARAM = "P~"; // everything else

class Variable {
  constructor(name, originalName, type, datatype, value, allVars) {
    this.name = name;
    this.originalName = originalName;
    this.type = type;
    this.datatype = datatype;
    this.childVarNames = createVars(value, allVars);
    this.value = this.datatype === "primitive" ? value : undefined;
  }

  primitiveString() {
    if (_.isString(this.value)) {
      return `"${this.value}"`;
    } else if (_.isBoolean(this.value)) {
      return this.value ? "True" : "False";
    } else if (_.isNull(this.value)) {
      return "None";
    } else {
      return `${this.value}`;
    }
  }

  arrayString() {
    return `[${this.childVarNames.join(", ")}]`;
  }

  objectString(allVars) {
    // If child is callable, then just return child var name
    // because the callable str is fully constructed in the child.
    if (this.childVarNames.length === 1) {
      const curr = allVars[this.childVarNames[0]];
      if (curr.datatype === "callable") {
        return curr.name;
      }
    }

    // Otherwise we're dealing with an object (dict)
    const childStrs = [];
    for (let k of this.childVarNames) {
      const curr = allVars[k];
      curr.createString(allVars);
      childStrs.push(`"${curr.originalName}": ${curr.name}`);
    }
    return `{${childStrs.join(", ")}}`;
  }

  callableString(allVars) {
    const childStrs = [];
    for (let k of this.childVarNames) {
      const curr = allVars[k];
      curr.createString(allVars);
      childStrs.push(`${curr.originalName}=${curr.name}`);
    }
    return `${this.originalName}(${childStrs.join(", ")})`;
  }

  createString(allVars) {
    if (this.str !== undefined) {
      return;
    }
    let valueStr = "";
    if (this.datatype === "primitive") {
      valueStr = this.primitiveString();
    } else if (this.datatype === "array") {
      valueStr = this.arrayString();
    } else if (this.datatype === "object") {
      valueStr = this.objectString(allVars);
    } else if (this.datatype === "callable") {
      valueStr = this.callableString(allVars);
    }
    const varName = this.type === VARIABLE ? this.originalName : this.name;
    this.str = `${varName} = ${valueStr}`;
  }

  addToQueue(allVars, queue) {
    this.childVarNames.forEach((k) => allVars[k].addToQueue(allVars, queue));
    queue.push(this.str);
  }
}

// https://stackoverflow.com/a/1349426
function randomString(length) {
  let result = "";
  let characters = "abcdefghijklmnopqrstuvwxyz";
  let charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

function genVarName(allVars) {
  let newVar = null;
  do {
    newVar = randomString(3);
  } while (newVar in allVars);
  return newVar;
}

function getDatatype(varType, value) {
  if (Array.isArray(value)) {
    return "array";
  } else if (_.isObject(value)) {
    if (varType === OBJ) {
      return "callable";
    }
    return "object";
  } else {
    return "primitive";
  }
}

function createVar(key, value, allVars) {
  let [varType, trueKey] = [key.slice(0, 2), key.slice(2)];
  const datatype = getDatatype(varType, value);
  const varName = varType === VARIABLE ? trueKey : genVarName(allVars);
  return new Variable(varName, trueKey, varType, datatype, value, allVars);
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
  for (let k of Object.keys(x)) {
    addChildVarName(k, x[k], allVars, childVarNames);
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

export function generateCode(selected) {
  const allVars = {};
  createVars(selected, allVars);
  for (let v of Object.values(allVars)) {
    v.createString(allVars);
  }

  const queue = [];
  for (let v of Object.values(allVars)) {
    v.addToQueue(allVars, queue);
  }

  const strSet = new Set();
  const output = [];
  for (let v of queue) {
    if (!strSet.has(v)) {
      output.push(v);
      strSet.add(v);
    }
  }
  const outputStr = output.join("\n");

  // console.log("allVars\n", allVars);
  // console.log("queue\n", queue);
  console.log(outputStr);
}

// Assign every ~V, ~O, and ~P to a global variable namespace
// When creating a variable, create its children variables and keep track of those variables, i.e. make a tree of the variables
// The code starts with all necessary imports, and then creates variable assignments doing a bottom-up traversal of the tree

// if it's a string, number, boolean, or null, then the var has no children
// if it's an object, then the number of children is the number of keys in the object
// if it's an array, then the number of children i
