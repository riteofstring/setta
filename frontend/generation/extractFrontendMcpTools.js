import fs from "fs";
import { glob } from "glob";
import jsdoc from "jsdoc-api";
import path from "path";
import prettier from "prettier";
import prettierPluginOrganizeImports from "prettier-plugin-organize-imports";

// Find all JS/TS files recursively
function findFiles(sourceDir, extensions) {
  const patterns = extensions.map((ext) => `${sourceDir}/**/*${ext}`);
  return patterns.flatMap((pattern) => glob.sync(pattern));
}

// Main function
async function main() {
  const sourceDir = "../src";
  const jsonOutputFile = "./mcp-tools.json";
  const registryOutputFile = "../src/state/mcpToolRegistry.js";
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

    const allTools = [];
    const allTypedefs = {};

    // First, extract all typedefs
    for (const doc of docs) {
      if (doc.kind === "typedef" && doc.name) {
        // Store typedef with its full definition
        allTypedefs[doc.name] = doc;
      }
    }

    // Then, process all tools and link to typedefs
    for (const doc of docs) {
      if (
        doc.kind !== "function" ||
        !doc.tags ||
        !doc.tags.some((tag) => tag.originalTitle === "SETTA_MCP_TOOL") ||
        !doc.meta
      ) {
        continue;
      }

      // Add references to typedefs used by this tool
      if (doc.params) {
        for (const param of doc.params) {
          if (param.type && param.type.names) {
            // Find referenced typedefs in parameter types
            for (const typeName of param.type.names) {
              // If this is a typedef name (not a primitive type or union)
              if (allTypedefs[typeName]) {
                param.typedefRef = typeName;
              }
            }
          }
        }
      }

      allTools.push(doc);
    }

    // Add typedefs to the output
    const output = {
      tools: allTools,
      typedefs: allTypedefs,
    };

    // Write JSON for Python generator
    fs.writeFileSync(jsonOutputFile, JSON.stringify(output, null, 2));
    console.log(
      `Successfully extracted ${allTools.length} MCP tools and ${
        Object.keys(allTypedefs).length
      } typedefs to ${jsonOutputFile}`,
    );

    // Generate JavaScript registry file
    generateRegistryFile(allTools, registryOutputFile);
    console.log(
      `Successfully generated MCP tool registry at ${registryOutputFile}`,
    );
  } catch (err) {
    console.error("\nError processing files:", err);
  }
}

// Generate the JavaScript registry file
async function generateRegistryFile(tools, outputPath) {
  // Create the imports
  const imports = [];
  const registryEntries = [];

  for (const tool of tools) {
    const functionName = tool.name;

    // Construct full path by combining path and filename
    const fullPath = path.join(tool.meta.path, tool.meta.filename);

    // Calculate relative path from output directory to the source file
    let relativePath = path
      .relative(path.dirname(outputPath), fullPath)
      .replace(/\.[^/.]+$/, ""); // Remove file extension

    // Convert Windows paths to Unix-style paths
    let importPath = relativePath.replace(/\\/g, "/");

    // Add "./" prefix if the path doesn't start with "." or "/"
    if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
      importPath = "./" + importPath;
    }

    imports.push(`import { ${functionName} } from "${importPath}";`);
    registryEntries.push(`  ${functionName}`);
  }

  // Generate the file content
  let fileContent = `// GENERATED FILE - DO NOT EDIT MANUALLY
// Generated automatically
import C from "constants/constants.json";
import { sendMessage } from "requests/websocket";

${imports.join("\n")}

// Registry of all MCP tools
const mcpToolRegistry = {
${registryEntries.join(",\n")}
};

export async function mcpToolUse(details) {
  const { fnName, args = {}, id } = details;
  let result;

  try {
    // Check if the function exists in our registry
    if (fnName in mcpToolRegistry) {
      // Call the function with the provided arguments
      result = await mcpToolRegistry[fnName](args);
    } else {
      throw new Error(\`Unknown MCP tool function: \${fnName}\`);
    }
  } catch (error) {
    console.error(\`Error executing MCP tool \${fnName}:\`, error);
    result = { [C.SETTA_MCP_TOOL_ERROR]: error.message };
  }

  if (result === undefined) {
    result = null;
  }

  // Send the result back to the backend
  sendMessage({
    id,
    content: result,
    messageType: C.WS_MCP_TOOL_USE_RETURN,
  });
}
`;

  try {
    // Format the file content with prettier
    const prettierConfig = await prettier.resolveConfig(process.cwd());
    fileContent = await prettier.format(fileContent, {
      ...prettierConfig,
      parser: "babel",
      plugins: [prettierPluginOrganizeImports],
    });
    console.log("Successfully formatted code with prettier");
  } catch (error) {
    console.warn(
      `Warning: Could not format code with prettier: ${error.message}`,
    );
  }

  // Create directory if it doesn't exist
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Write the file
  fs.writeFileSync(outputPath, fileContent);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
