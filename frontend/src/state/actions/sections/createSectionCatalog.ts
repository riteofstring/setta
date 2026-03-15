import _ from "lodash";
import { usePluginSectionKinds } from "plugins/runtime";
import { useProjectState } from "state/definitions";
import {
  getPythonCodegenTarget,
  projectConfigHasPythonCodegen,
} from "utils/codegenTargets";
import { SectionTypeEnum } from "utils/generatedTypes";

import { getBaseCreateSectionGroups } from "./createSectionCatalogStatic";
import type {
  CreateSectionsContextMenuGroup,
  CreateSectionsContextMenuInfo,
} from "./createSectionCatalogTypes";

export type {
  CreateSectionsContextMenuGroup,
  CreateSectionsContextMenuInfo,
} from "./createSectionCatalogTypes";

export function useCreateSectionsList(): Array<CreateSectionsContextMenuGroup> {
  const pluginSectionKinds = usePluginSectionKinds();
  const singletonSections = useProjectState(
    (x) => x.singletonSections,
    _.isEqual,
  );
  const pythonCodegenEnabled = useProjectState((x) =>
    projectConfigHasPythonCodegen(x.projectConfig),
  );
  const metadataEnabled = useProjectState(
    (x) => getPythonCodegenTarget(x.projectConfig)?.generateMetadata ?? false,
  );
  const groups = getBaseCreateSectionGroups();
  const sectionGroupItems = groups.find(
    (group) => group.group === "Section",
  )?.items;
  const codeGroupItems = groups.find((group) => group.group === "Code")?.items;
  if (!sectionGroupItems || !codeGroupItems) {
    throw new Error("Missing base section creation groups.");
  }

  if (!singletonSections.GlobalVariables) {
    sectionGroupItems.push({
      name: "Global Variables",
      implSpecs: { type: SectionTypeEnum.GlobalVariables },
    });
  }
  if (pythonCodegenEnabled && !singletonSections.GenPythonCode) {
    codeGroupItems.push({
      name: "Show Generated Python",
      implSpecs: {
        type: SectionTypeEnum.GenPythonCode,
      },
    });
  }
  if (metadataEnabled && !singletonSections.GenPythonMetadata) {
    codeGroupItems.push({
      name: "Show Generated Python Metadata",
      implSpecs: {
        type: SectionTypeEnum.GenPythonMetadata,
      },
    });
  }

  const pluginSectionItems: Array<CreateSectionsContextMenuInfo> =
    pluginSectionKinds.map((sectionKind) => ({
      name: sectionKind.title,
      commandId: `plugin-section:${sectionKind.pluginId}:${sectionKind.kind}`,
      implSpecs: {
        type: SectionTypeEnum.Plugin,
        pluginId: sectionKind.pluginId,
        kind: sectionKind.kind,
        data: sectionKind.initialData ?? {},
      },
    }));
  if (pluginSectionItems.length > 0) {
    groups.push({
      group: "Plugins",
      items: pluginSectionItems,
    });
  }
  return groups;
}
