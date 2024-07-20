const fs = require('fs').promises;

async function loadAndModifyJson(filePath) {
  try {
    // Load the JSON file
    const data = await fs.readFile(filePath, 'utf8');
    const json = JSON.parse(data);

    // Check if json contains 'configs' and it's an array
    if (json.configs && Array.isArray(json.configs)) {
      json.configs.forEach(config => {
        if (config.projectConfig && config.projectConfig.children && config.sections) {
          // Transform 'children' into a list of ids
          const childrenIds = Object.keys(config.projectConfig.children);
          const newChildren = childrenIds.map(id => id);

          // Move x, y, zIndex to 'sections'
          childrenIds.forEach(id => {
            const { x, y, zIndex } = config.projectConfig.children[id];
            if (!config.sections[id]) config.sections[id] = {};
            config.sections[id].position = {x,y}
            config.sections[id].zIndex = zIndex
          });

          // Update 'children' to the new list of ids
          config.projectConfig.children = newChildren;
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
