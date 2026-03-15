import {
  getBaseEmbedGroupItems,
  getBaseMetaControlGroupItems,
} from "./createSectionCatalogControlGroups";
import {
  getBaseArtifactGroupItems,
  getBaseCodeSectionCreateItems,
  getBaseOtherGroupItems,
  getBaseSectionGroupItems,
  getBaseWorkflowGroupItems,
} from "./createSectionCatalogSectionGroups";
import type { CreateSectionsContextMenuGroup } from "./createSectionCatalogTypes";

export function getBaseCreateSectionGroups(): Array<CreateSectionsContextMenuGroup> {
  return [
    {
      group: "Section",
      items: getBaseSectionGroupItems(),
    },
    {
      group: "Code",
      items: getBaseCodeSectionCreateItems(),
    },
    {
      group: "Artifacts",
      items: getBaseArtifactGroupItems(),
    },
    {
      group: "Workflow",
      items: getBaseWorkflowGroupItems(),
    },
    {
      group: "Other",
      items: getBaseOtherGroupItems(),
    },
    {
      group: "MetaControls",
      items: getBaseMetaControlGroupItems(),
    },
    {
      group: "Embed",
      items: getBaseEmbedGroupItems(),
    },
  ];
}
