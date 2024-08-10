const fs = require("fs").promises;

async function loadAndModifyJson(filePath) {
  try {
    // Load the JSON file
    const data = await fs.readFile(filePath, "utf8");
    const json = JSON.parse(data);

    const sectionInfos = {};
    const sectionConfigs = {};
    const sectionVariants = {};

    for (const [sectionId, x] of Object.entries(json.sections)) {
      sectionConfigs[sectionId] = {
        id: sectionId,
        size: x.size,
        variantId: x.evColId,
        paramSweepId: x.paramSweepId,
        selectedItem: x.selectedItem,
        versionsHeight: x.versionsHeight,
        versionsVisible: x.versionsVisible,
      };

      sectionInfos[sectionId] = {};
      for (const [k, v] of Object.entries(x)) {
        if (
          k !== "evColId" &&
          k !== "children" &&
          (k === "id" || !(k in sectionConfigs[sectionId]))
        ) {
          if (k === "evColIds") {
            sectionInfos[sectionId].variantIds = v;
          } else {
            sectionInfos[sectionId][k] = v;
          }
        }
      }

      for (const e of x.evColIds) {
        console.log("json.evCols", json.evCols);
        console.log("e", e);
        console.log("dbSource", x.dbSource);
        const dbSource = x.dbSource ? x.dbSource : "default";
        const src = json.evCols[dbSource][e];
        sectionVariants[dbSource] = {};
        sectionVariants[dbSource][e] = {
          name: src.name,
          values: src.values,
          children: x.children,
        };
      }
    }

    json.sections = sectionInfos;
    json.sectionConfigs = sectionConfigs;
    json.sectionVariants = sectionVariants;
    delete json.evCols;

    // Save the modified JSON back to the file or handle it as needed
    // Uncomment the following line to save changes back to the file
    await fs.writeFile(filePath, JSON.stringify(json, null, 2), "utf8");

    return json; // Or handle the modified JSON as needed
  } catch (error) {
    console.error("Error processing JSON file:", error);
    throw error;
  }
}

// Usage example (replace 'path/to/yourfile.json' with the actual file path)
loadAndModifyJson("seed/examples/argparse_example/argparse_example.json").then(
  (modifiedJson) => console.log(modifiedJson)
);
