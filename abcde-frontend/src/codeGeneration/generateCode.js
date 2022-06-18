class Variable {
  constructor(name, details) {
    this.name = name;
    this.details = details;
  }

  asString() {
    return `${this.name}=\n`;
  }
}

export function generateCode(selected) {
  let output = "";

  for (let k of Object.keys(selected)) {
    output += new Variable(k, selected[k]).asString();
  }
  return output;
}
