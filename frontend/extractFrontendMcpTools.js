import fs from "fs";
import { glob } from "glob";
import jsdoc from "jsdoc-api";

// Find all JS/TS files recursively
function findFiles(sourceDir, extensions) {
  const patterns = extensions.map((ext) => `${sourceDir}/**/*${ext}`);
  return patterns.flatMap((pattern) => glob.sync(pattern));
}

// Main function
async function main() {
  const sourceDir = "./src";
  const outputFile = "./mcp-tools.json";
  const extensions = [".js", ".jsx", ".ts", ".tsx"];

  console.log(
    `Scanning ${sourceDir} for files with extensions: ${extensions.join(", ")}`,
  );

  const files = findFiles(sourceDir, extensions);
  console.log(`Found ${files.length} files to process`);

  try {
    // Process all files in a single jsdoc.explain() call
    const docs = await jsdoc.explain({
      files: files,
      cache: false,
    });

    // Clear the processing message
    const allTools = [];

    for (const doc of docs) {
      if (
        doc.kind !== "function" ||
        !doc.tags ||
        !doc.tags.some((tag) => tag.originalTitle === "SETTA_MCP_TOOL") ||
        !doc.meta
      ) {
        continue;
      }
      // Add to flat list
      allTools.push(doc);
    }

    fs.writeFileSync(outputFile, JSON.stringify(allTools, null, 2));
    console.log(
      `Successfully extracted ${allTools.length} MCP tools to ${outputFile}`,
    );
  } catch (err) {
    console.error("\nError processing files:", err);
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
