export default {
  "9520d638-b662-44d0-97a3-e1dfabeb2939": {
    id: "9520d638-b662-44d0-97a3-e1dfabeb2939",
    name: "My switch",
    type: "SWITCH",
    presetType: "USER",
    config: {},
    isForChildOfOriginInfoId: false,
  },
  "796ac83d-bb70-489d-89ed-13c73094982f": {
    id: "796ac83d-bb70-489d-89ed-13c73094982f",
    name: "Kevin's Slider",
    type: "SLIDER",
    presetType: "USER",
    config: { min: 10, max: 100, step: 10 },
    isForChildOfOriginInfoId: false,
  },
  "846a8370-fbfc-4d99-a249-40dbdaac4cd3": {
    id: "846a8370-fbfc-4d99-a249-40dbdaac4cd3",
    name: "torchvision transforms",
    type: "LIST_ROOT",
    presetType: "USER",
    config: {
      collections: ["1ec242dd-688e-4f71-a0de-cc13752461ce"],
      subType: null,
      childUITypeId: "eb52c8be-fe8b-4439-b74c-e755135c8415",
    },
    isForChildOfOriginInfoId: false,
  },
  "eb52c8be-fe8b-4439-b74c-e755135c8415": {
    id: "eb52c8be-fe8b-4439-b74c-e755135c8415",
    type: "SECTION",
    name: "torchvision transforms",
    config: {
      collections: ["1ec242dd-688e-4f71-a0de-cc13752461ce"],
      childUITypeId: null,
      subType: "LIST",
    },
    presetType: "USER",
    originInfoId: {
      sectionId: "e304954a-d52d-47fc-8c79-c47c6e53e752",
    },
    isForChildOfOriginInfoId: true,
  },
  "a23ffe0c-3052-4964-843b-d84aa352b611": {
    id: "a23ffe0c-3052-4964-843b-d84aa352b611",
    name: "my preset for testing",
    type: "LIST_ROOT",
    presetType: "USER",
    config: {
      collections: ["1ec242dd-688e-4f71-a0de-cc13752461ce"],
      subType: null,
      childUITypeId: null,
    },
    isForChildOfOriginInfoId: false,
  },
};
