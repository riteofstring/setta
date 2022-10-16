const allCodeInfo = require("./src/__tests__data/PresetUITypes.ts");
const fs = require("fs");

fs.writeFileSync(
  "./src/__tests__data/PresetUITypes.json",
  JSON.stringify(allCodeInfo, null, 4)
);
