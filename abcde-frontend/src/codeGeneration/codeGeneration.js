// class Parameter {
//   constructor(name, value) {
//     this.name = name;
//     this.value = value;
//   }
import _ from "lodash";

//   asString() {
//     return `${this.name}=${this.value}\n`;
//   }
// }

// class Parameter {
//   constructor(name, value) {
//     this.name = name;
//   }

//   asString() {
//     return `${this.name}=\n`;
//   }
// }

// class Callable {
//   constructor(name, value) {
//     this.name = name;
//     this.value = createTypes(value);
//   }

//   asString() {
//     return `${this.name}=\n`;
//   }
// }

class Variable {
  constructor(name, type, value, allVars) {
    this.name = name;
    this.type = type;
    this.childVarNames = createVars(value, allVars);
  }

  asString() {
    return `${this.name}=\n`;
  }
}

const VARIABLE = "V~";
const OBJ = "O~";
const PARAM = "P~";

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

function createVar(key, value, allVars) {
  let [varType, trueKey] = [key.slice(0, 2), key.slice(2)];
  return new Variable(trueKey, varType, value, allVars);
}

function createVars(x, allVars) {
  if (!_.isObject(x)) {
    return [];
  }
  if (Array.isArray(x)) {
    return x.reduce(
      (prev, curr) => [...prev, ...createVars(curr, allVars)],
      []
    );
  }
  const childVarNames = [];
  for (let k of Object.keys(x)) {
    const newVar = createVar(k, x[k], allVars);
    const newVarName = genVarName(allVars);
    allVars[newVarName] = newVar;
    childVarNames.push(newVarName);
  }
  return childVarNames;
}

export function generateCode(selected) {
  const allVars = {};
  const output = createVars(selected, allVars);
  console.log("allVars", allVars);
}

// Assign every ~V, ~O, and ~P to a global variable namespace
// When creating a variable, create its children variables and keep track of those variables, i.e. make a tree of the variables
// The code starts with all necessary imports, and then creates variable assignments doing a bottom-up traversal of the tree
