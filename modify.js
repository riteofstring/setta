const fs = require("fs").promises;

async function loadAndModifyJson(filePath) {
  try {
    // Load the JSON file
    const data = await fs.readFile(filePath, "utf8");
    const json = JSON.parse(data);
    const sections = {};
    for (const [k, v] of Object.entries(json.sections)) {
      sections[k] = { ...json.sections[k], ...json.sectionConfigs[k] };
    }
    json.sections = sections;
    delete json.sectionConfigs;
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
loadAndModifyJson("seed/examples/diffusionDrops/diffusionDrops.json").then(
  (modifiedJson) => console.log(modifiedJson)
);
