const fs = require("fs");
const path = require("path");
const defaultValues = JSON.parse(
  fs.readFileSync("constants/defaultValues.json", "utf8")
);

function loadAndModifyJson(filePath) {
  console.log("filePath", filePath);
  try {
    // Load the JSON file
    const data = fs.readFileSync(filePath, "utf8");
    const json = JSON.parse(data);
    for (const s of Object.values(json.sectionVariants)) {
      // console.log("s.values", s.values)
      if (!s.values){
        continue
      }
      for (const [k, v] of Object.entries(s.values)) {
        console.log("v.value, v.keywordPositions", v.value, v.keywordPositions)
        if (!v.value && v.keywordPositions.length === 0) {
          console.log("Deleting", k)
          delete s.values[k];
        }
      }
    }

    // Save the modified JSON back to the file or handle it as needed
    // Uncomment the following line to save changes back to the file
    fs.writeFileSync(filePath, JSON.stringify(json, null, 2), "utf8");

    return json; // Or handle the modified JSON as needed
  } catch (error) {
    console.error("Error processing JSON file:", error);
    throw error;
  }
}

function getJsonFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach((file) => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getJsonFiles(filePath, fileList);
    } else if (path.extname(file) === ".json") {
      fileList.push(filePath);
    }
  });

  return fileList;
}

// Usage
const jsonFiles = getJsonFiles("seed");
for (const j of jsonFiles) {
  if (j.includes("Settings.json")) {
    continue;
  }
  loadAndModifyJson(j);
}
