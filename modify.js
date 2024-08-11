const fs = require("fs").promises;
const base_ui_types = {
  "3fdaeb6a-e989-4888-b844-17a76f0b0192": {
    id: "3fdaeb6a-e989-4888-b844-17a76f0b0192",
    type: "TEXT",
    name: "",
    presetType: "BASE",
    config: {},
  },
  "eab8f446-17cc-4512-bab5-42bff8570f1f": {
    id: "eab8f446-17cc-4512-bab5-42bff8570f1f",
    type: "SLIDER",
    name: "",
    presetType: "BASE",
    config: {
      min: 0,
      max: 100,
      step: 1,
    },
  },
  "69cdf4c5-7555-4ef3-93d3-bda03f33c6d5": {
    id: "69cdf4c5-7555-4ef3-93d3-bda03f33c6d5",
    type: "SWITCH",
    name: "",
    presetType: "BASE",
    config: {},
  },
  "0191cde4-3d98-4ba0-972a-fead19b8ac73": {
    id: "0191cde4-3d98-4ba0-972a-fead19b8ac73",
    type: "SECTION",
    name: "",
    presetType: "BASE",
    config: {},
  },
  "ab68ebd2-7a99-47d6-a7ec-b45857bcd49f": {
    id: "ab68ebd2-7a99-47d6-a7ec-b45857bcd49f",
    type: "LIST_ROOT",
    name: "",
    presetType: "BASE",
    config: {},
  },
  "623a9242-53e9-4b42-b695-431e9754a836": {
    id: "623a9242-53e9-4b42-b695-431e9754a836",
    type: "DICT_ROOT",
    name: "",
    presetType: "BASE",
    config: {},
  },
  "0e050316-06ca-48f4-92c1-9845abdf85f7": {
    id: "0e050316-06ca-48f4-92c1-9845abdf85f7",
    type: "DECK",
    name: "",
    presetType: "BASE",
    config: {},
  },
  "06b511f3-dced-43be-97d7-1ceaddc763d5": {
    id: "06b511f3-dced-43be-97d7-1ceaddc763d5",
    type: "OUTPUT",
    name: "",
    presetType: "BASE",
    config: {},
  },
  "2b06a83b-b96a-490d-a2d7-3631619e6495": {
    id: "2b06a83b-b96a-490d-a2d7-3631619e6495",
    type: "INFO",
    name: "",
    presetType: "BASE",
    config: {},
  },
  "76cd4b19-cc63-4e2c-8214-5a4246ca637c": {
    id: "76cd4b19-cc63-4e2c-8214-5a4246ca637c",
    type: "SOCIAL",
    name: "",
    presetType: "BASE",
    config: {},
  },
  "b2cda88e-7b77-4dff-8503-3c7e07a3ff0a": {
    id: "b2cda88e-7b77-4dff-8503-3c7e07a3ff0a",
    type: "GLOBAL_VARIABLES",
    name: "",
    presetType: "BASE",
    config: {},
  },
  "af9f2cfd-8cb6-44fd-9736-eefffae4cd29": {
    id: "af9f2cfd-8cb6-44fd-9736-eefffae4cd29",
    type: "CODE",
    name: "",
    presetType: "BASE",
    config: {},
  },
  "a2ecb6fe-45c7-4e8b-8424-8d5955256f89": {
    id: "a2ecb6fe-45c7-4e8b-8424-8d5955256f89",
    type: "VAR_CONTROL",
    name: "",
    presetType: "BASE",
    config: {},
  },
  "af0538a7-9667-400e-987e-ae3c844e0fcd": {
    id: "af0538a7-9667-400e-987e-ae3c844e0fcd",
    type: "PARAM_SWEEP",
    name: "",
    presetType: "BASE",
    config: {},
  },
  "d6d40533-ee47-42a5-8b55-5455716c71ac": {
    id: "d6d40533-ee47-42a5-8b55-5455716c71ac",
    type: "TERMINAL",
    name: "",
    presetType: "BASE",
    config: {},
  },
  "02f5da7b-71ae-4e42-b5b3-286fae1823ee": {
    id: "02f5da7b-71ae-4e42-b5b3-286fae1823ee",
    type: "GLOBAL_PARAM_SWEEP",
    name: "",
    presetType: "BASE",
    config: {},
  },
};

async function loadAndModifyJson(filePath) {
  try {
    // Load the JSON file
    const data = await fs.readFile(filePath, "utf8");
    const json = JSON.parse(data);
    const uiTypeIdsToDelete = new Set();
    for (const [k, v] of Object.entries(json.sections)) {
      const uiType = json.uiTypes[v.uiTypeId];
      if (!uiType) {
        continue;
      }
      uiTypeIdsToDelete.add(v.uiTypeId);
      v.codeInfoId = uiType.config.codeInfoId;
      for (const [k2, v2] of Object.entries(base_ui_types)) {
        if (uiType.type === v2.type) {
          v.uiTypeId = k2;
          break;
        }
      }
    }
    for (const id of Array.from(uiTypeIdsToDelete)) {
      delete json.uiTypes[id];
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
loadAndModifyJson("seed/examples/sklearn_example/sklearn_example.json");
