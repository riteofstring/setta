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
    for (const s of Object.values(json.sections)) {
      for (const [k, v] of Object.entries(s)) {
        const currDefault = defaultValues.section[k];
        if (
          v === currDefault ||
          (v === 0 && currDefault === false) ||
          (Array.isArray(v) &&
            v.length === 0 &&
            Array.isArray(currDefault) &&
            currDefault.length === 0) ||
          (v === null && currDefault === "") ||
          (k === "codeLanguage" && v === "") ||
          (k === "canvasSettings" && Object.keys(v).length === 0) ||
          (k === "selectedVariantIds" && Object.keys(v).length === 0) ||
          k === "isInOtherProjectConfigs" ||
          (k === "size" && v.width === "auto" && v.height === "auto") ||
          k === "resizeEvent" ||
          (k === "aspectRatio" && !v) ||
          (k === "aspectRatioExtraHeight" && !v) ||
          (k === "aspectRatioExtraWidth" && !v)
        ) {
          delete s[k];
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
