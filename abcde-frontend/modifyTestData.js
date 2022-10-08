const x = require("./src/__tests__data/Projects.ts");
const fs = require("fs");

const newOutput = [];

for (const k of Object.keys(x)) {
  newOutput.push(x[k]);
}

console.log(newOutput);

fs.writeFileSync(
  "./src/__tests__data/Projects.json",
  JSON.stringify(newOutput, null, 4)
);
