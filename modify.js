const fs = require("fs").promises;

async function loadAndModifyJson(filePath) {
  try {
    // Load the JSON file
    const data = await fs.readFile(filePath, "utf8");
    const json = JSON.parse(data);
    for (const [k, v] of Object.entries(json.sections)) {
      if (!("codeInfoId" in v)) {
        console.log("codeInfoId not in", v);
        v.codeInfoId = null;
      }
    }

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
loadAndModifyJson("seed/examples/interactive_example/interactive_example.json");
