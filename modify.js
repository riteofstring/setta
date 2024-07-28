const fs = require('fs').promises;

async function loadAndModifyJson(filePath) {
  try {
    // Load the JSON file
    const data = await fs.readFile(filePath, 'utf8');
    const json = JSON.parse(data);

    // Check if json contains 'configs' and it's an array
    if (json.configs && Array.isArray(json.configs)) {
      json.configs.forEach(config => {
        if (config.codeInfo) {
          for (const [k,v] of Object.entries(config.codeInfo)){
            v.positionalOnly = false
            config.codeInfo[k] = v
          }
        }
      });
    }

    // Save the modified JSON back to the file or handle it as needed
    // Uncomment the following line to save changes back to the file
    await fs.writeFile(filePath, JSON.stringify(json, null, 2), 'utf8');

    return json; // Or handle the modified JSON as needed
  } catch (error) {
    console.error('Error processing JSON file:', error);
    throw error;
  }
}

// Usage example (replace 'path/to/yourfile.json' with the actual file path)
loadAndModifyJson('seed/exampleProjects/sklearn_example/sklearn_example.json').then(modifiedJson => console.log(modifiedJson));
