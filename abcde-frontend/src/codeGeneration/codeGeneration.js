import _ from "lodash";

const VARIABLE = "V~";
const OBJ = "O~";
const PARAM = "P~";

class Variable {
  constructor(name, type, datatype, value, allVars) {
    this.name = name;
    this.type = type;
    this.datatype = datatype;
    this.childVarNames = createVars(value, allVars);
    this.value = this.childVarNames.length === 0 ? value : undefined;
  }

  asString() {
    return `${this.name}=\n`;
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

function getDatatype(x) {
  if (Array.isArray(x)) {
    return "array";
  } else if (_.isObject(x)) {
    return "object";
  } else {
    return "primitive";
  }
}

function createVar(key, value, allVars) {
  let [varType, trueKey] = [key.slice(0, 2), key.slice(2)];
  const datatype = getDatatype(value);
  return new Variable(trueKey, varType, datatype, value, allVars);
}

function addChildVarName(key, value, allVars, childVarNames) {
  const newVar = createVar(key, value, allVars);
  const newVarName = genVarName(allVars);
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
  console.log("allVars", allVars);
}

// Assign every ~V, ~O, and ~P to a global variable namespace
// When creating a variable, create its children variables and keep track of those variables, i.e. make a tree of the variables
// The code starts with all necessary imports, and then creates variable assignments doing a bottom-up traversal of the tree

// if it's a string, number, boolean, or null, then the var has no children
// if it's an object, then the number of children is the number of keys in the object
// if it's an array, then the number of children i
