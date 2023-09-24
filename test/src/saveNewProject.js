const project = require("./NewProject.json");
const fs = require("fs");

for (const data of [project]) {
  for (const [k, v] of Object.entries(data)) {
    let filename = "";
    if (k === "evCols") {
      filename = "EVCols";
    } else if (k === "uiTypes") {
      filename = "UITypes";
    } else if (k === "uiTypeCols") {
      filename = "UITypeCols";
    } else {
      filename = k.charAt(0).toUpperCase() + k.substring(1);
    }

    fs.writeFileSync(
      `./src/newProjectPlaceholder/${filename}.ts`,
      "export default " + JSON.stringify(v, null, 4)
    );
  }
}
