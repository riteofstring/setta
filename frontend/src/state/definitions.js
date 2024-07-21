import {
  initialShortcuts,
  jsonSettings,
  otherConfigurableSettings,
  SECTION_CONFIG_TAB,
} from "utils/constants";
import { createNewId } from "utils/idNameCreation";
import { temporal } from "zundo";
import { subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import {
  create,
  createProjectState,
  stateWithResetFn,
} from "./definitions/utils";

export const useActiveSection = createProjectState(
  temporal(() => ({
    ids: [],
    version: 0,
  })),
);

export const useCodeInfo = createProjectState(
  temporal(
    immer(() => ({
      x: {},
      version: 0,
    })),
  ),
);

export const useContextMenus = createProjectState(
  stateWithResetFn({
    pane: { isOpen: false, x: 0, y: 0 },
    deck: { isOpen: false, x: 0, y: 0, sectionId: null },
    selection: { isOpen: false, x: 0, y: 0, nodeIds: [] },
  }),
);

export const useEVCols = createProjectState(
  temporal(
    immer(() => ({
      x: {},
      version: 0,
    })),
  ),
);

export const useHomePageSearch = create(() => ({
  value: "",
}));

export const useInfoView = createProjectState(() => ({
  currValue: "",
}));

export const useInteractive = create(() => ({
  id: createNewId(),
  projects: new Set(),
  currProjectIsInteractive: false,
  data: null,
}));

export const useKeywordRegex = create(() => ({
  pattern: "",
  fullNameToInfo: {},
}));

// map from key to true or false
// keys are of the form:
// {sectionId}-null for the main section combobox
// {sectionId}-{paramInfoId} for section parameter fields
export const useWaitingForLSPResult = createProjectState(() => ({}));

export const useModal = createProjectState(() => ({
  open: false,
  modalType: null,
  modalData: null,
}));

export const useNodeInternals = createProjectState(
  temporal(() => ({
    x: new Map(),
    version: 0,
  })),
);

export const useNotification = create(() => ({
  message: "",
  timeoutId: null,
}));

export const useOtherProjectConfigs = createProjectState(
  immer(() => ({
    x: [],
  })),
);

export const useOutputGroups = createProjectState(
  immer(() => ({
    x: {},
  })),
);

export const useOutputs = createProjectState(
  immer(() => ({
    x: {},
  })),
);

export const useParamSweep = createProjectState(
  temporal(
    immer(() => ({
      x: {},
      version: 0,
    })),
  ),
);

export const useProject = createProjectState(() => ({
  id: "",
  name: "",
  defaultConfigId: null,
}));

export const useProjectConfig = createProjectState(
  temporal(
    immer(() => ({
      id: "",
      name: "",
      version: 0,
    })),
  ),
);

export const useProjectSearch = createProjectState(() => ({
  sections: [],
  codeInfo: [],
}));

export const useRunGroups = createProjectState(
  temporal(
    immer(() => ({
      x: {},
      version: 0,
    })),
  ),
);

export const useSectionInfos = createProjectState(
  temporal(
    subscribeWithSelector(
      immer(() => ({
        x: {},
        version: 0,
      })),
    ),
  ),
);

export const useSectionParamFilter = createProjectState(
  immer(() => ({
    x: {},
  })),
);

export const useSectionToParams = createProjectState(
  temporal(
    immer(() => ({
      callables: {},
      params: {},
    })),
  ),
);

export const useSettings = create(() => ({
  settingsLoaded: false,
  ...jsonSettings,
  ...otherConfigurableSettings,
  ...initialShortcuts,
}));

export const useStateVersion = createProjectState(
  temporal(() => ({
    version: 0,
  })),
);

// TODO: remove this hardcoded example error
export const useTypeErrors = createProjectState(() => ({
  "d96cb110-6f72-435a-b745-2d55e277f983": {
    "0aa0f46a-e923-4528-a411-500cbda6e77b":
      "error: Argument 1 to 'process_data' of 'DataProcessor' has incompatible type 'List[Union[int, str, List[Any]]]'; expected 'List[Union[int, float, Dict[str, Union[int, float]]]]'",
  },
}));

export const useUIEditor = createProjectState(() => ({
  tab: SECTION_CONFIG_TAB,
}));

export const useUITypeCols = createProjectState(
  temporal(
    immer(() => ({
      y: {},
      version: 0,
    })),
  ),
);

export const useUITypes = createProjectState(
  temporal(
    immer(() => ({
      x: {},
      version: 0,
    })),
  ),
);

export const useWebsocketConnectionList = create(() => ({
  connectedTo: null,
  connections: [],
}));

export const useWebsocketRooms = createProjectState(
  subscribeWithSelector(() => ({})),
);
