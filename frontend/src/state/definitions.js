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
import { create, createProjectState, withResetFn, withVersion } from "./utils";

export const useActiveSection = createProjectState(
  temporal(() =>
    withVersion({
      ids: [],
    }),
  ),
);

export const useCodeInfo = createProjectState(
  temporal(
    immer(() =>
      withVersion({
        x: {},
      }),
    ),
  ),
);

export const useContextMenus = createProjectState(
  withResetFn({
    pane: { isOpen: false, x: 0, y: 0 },
    deck: { isOpen: false, x: 0, y: 0, sectionId: null },
    selection: { isOpen: false, x: 0, y: 0, nodeIds: [] },
  }),
);

export const useEVCols = createProjectState(
  temporal(
    immer(() =>
      withVersion({
        x: {},
      }),
    ),
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
  temporal(() =>
    withVersion({
      x: new Map(),
    }),
  ),
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
    immer(() =>
      withVersion({
        x: {},
      }),
    ),
  ),
);

export const useProject = createProjectState(() => ({
  id: "",
  name: "",
  defaultConfigId: null,
}));

export const useProjectConfig = createProjectState(
  temporal(
    immer(() =>
      withVersion({
        id: "",
        name: "",
      }),
    ),
  ),
);

export const useProjectSearch = createProjectState(() => ({
  sections: [],
  codeInfo: [],
}));

export const useRunGroups = createProjectState(
  temporal(
    immer(() =>
      withVersion({
        x: {},
      }),
    ),
  ),
);

export const useSectionInfos = createProjectState(
  temporal(
    subscribeWithSelector(
      immer(() =>
        withVersion({
          x: {},
        }),
      ),
    ),
  ),
);

export const useSectionParamFilter = createProjectState(
  immer(() => ({
    x: {},
  })),
);

export const useSectionRefs = createProjectState(
  immer(() => ({
    withNested: {},
    selfOnly: {},
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
  temporal(() => withVersion({})),
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
    immer(() =>
      withVersion({
        y: {},
      }),
    ),
  ),
);

export const useUITypes = createProjectState(
  temporal(
    immer(() =>
      withVersion({
        x: {},
      }),
    ),
  ),
);

export const useWebsocketConnectionList = create(() => ({
  connectedTo: null,
  connections: [],
}));

export const useWebsocketRooms = createProjectState(
  subscribeWithSelector(() => ({})),
);
