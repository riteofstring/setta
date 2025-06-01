// Auto-generated JavaScript from Python Pydantic models
// UI Types List
export const BASE_UI_TYPES_LIST = [
  {
    id: "3fdaeb6a-e989-4888-b844-17a76f0b0192",
    type: "TEXT",
    name: "",
    presetType: "base",
    config: {},
  },
  {
    id: "eab8f446-17cc-4512-bab5-42bff8570f1f",
    type: "SLIDER",
    name: "",
    presetType: "base",
    config: {
      min: 0,
      max: 100,
      step: 1,
    },
  },
  {
    id: "69cdf4c5-7555-4ef3-93d3-bda03f33c6d5",
    type: "SWITCH",
    name: "",
    presetType: "base",
    config: {},
  },
  {
    id: "74de30af-accf-44db-9b6b-da4260f0bd60",
    type: "COLOR_PICKER",
    name: "",
    presetType: "base",
    config: {},
  },
  {
    id: "5b7755f7-8628-4b32-92e4-89eab596e4a3",
    type: "DROPDOWN",
    name: "",
    presetType: "base",
    config: {},
  },
  {
    id: "2180677d-333f-4ea4-ae37-dbbbb50671d7",
    type: "PASSWORD",
    name: "",
    presetType: "base",
    config: {},
  },
  {
    id: "0191cde4-3d98-4ba0-972a-fead19b8ac73",
    type: "SECTION",
    name: "",
    presetType: "base",
    config: {},
  },
  {
    id: "ab68ebd2-7a99-47d6-a7ec-b45857bcd49f",
    type: "LIST_ROOT",
    name: "",
    presetType: "base",
    config: {},
  },
  {
    id: "623a9242-53e9-4b42-b695-431e9754a836",
    type: "DICT_ROOT",
    name: "",
    presetType: "base",
    config: {},
  },
  {
    id: "0e050316-06ca-48f4-92c1-9845abdf85f7",
    type: "GROUP",
    name: "",
    presetType: "base",
    config: {},
  },
  {
    id: "06b511f3-dced-43be-97d7-1ceaddc763d5",
    type: "IMAGE",
    name: "",
    presetType: "base",
    config: {},
  },
  {
    id: "126547a6-d41e-4891-80f0-a0354f089c7c",
    type: "CHART",
    name: "",
    presetType: "base",
    config: {},
  },
  {
    id: "4ec2f5eb-3f66-4bce-a9e2-1eb4fdd96d6f",
    type: "DRAW",
    name: "",
    presetType: "base",
    config: {},
  },
  {
    id: "2b06a83b-b96a-490d-a2d7-3631619e6495",
    type: "TEXT_BLOCK",
    name: "",
    presetType: "base",
    config: {},
  },
  {
    id: "76cd4b19-cc63-4e2c-8214-5a4246ca637c",
    type: "SOCIAL",
    name: "",
    presetType: "base",
    config: {},
  },
  {
    id: "b2cda88e-7b77-4dff-8503-3c7e07a3ff0a",
    type: "GLOBAL_VARIABLES",
    name: "",
    presetType: "base",
    config: {},
  },
  {
    id: "af9f2cfd-8cb6-44fd-9736-eefffae4cd29",
    type: "CODE",
    name: "",
    presetType: "base",
    config: {},
  },
  {
    id: "2b516ed4-6b82-4445-95bf-6c7dac7f410a",
    type: "GEN_PYTHON_CODE",
    name: "",
    presetType: "base",
    config: {},
  },
  {
    id: "d6d40533-ee47-42a5-8b55-5455716c71ac",
    type: "TERMINAL",
    name: "",
    presetType: "base",
    config: {},
  },
  {
    id: "fae9523f-b9ee-4f0f-8785-3ce36c546aba",
    type: "IFRAME",
    name: "",
    presetType: "base",
    config: {},
  },
  {
    id: "5d7859dd-fd3f-4f5f-9b8c-fe9bede13c33",
    type: "CHAT",
    name: "",
    presetType: "base",
    config: {},
  },
  {
    id: "d58df269-fe7f-435b-99f4-5c8b351c956e",
    type: "BROWSER",
    name: "",
    presetType: "base",
    config: {},
  },
];

// UI Types by ID
export const BASE_UI_TYPES = {};
BASE_UI_TYPES_LIST.forEach((uiType) => {
  BASE_UI_TYPES[uiType.id] = uiType;
});

// UI Type IDs by Type
export const BASE_UI_TYPE_IDS = {};
BASE_UI_TYPES_LIST.forEach((uiType) => {
  BASE_UI_TYPE_IDS[uiType.type] = uiType.id;
});
