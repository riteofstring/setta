import { addTemporaryNotification } from "state/actions/notifications";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import { route_update_param_impl_config } from "utils/generatedEndpoints";
import {
  Position,
  SectionTypeEnum,
  SettaNotificationTypeEnum,
} from "utils/generatedTypes";
import { focusOnSectionSearch } from "utils/tabbingLogic";

import type { CreateSectionsContextMenuInfo } from "./createSectionCatalog";
import { createTopLevelSectionWithResult } from "./createSections";

export function createTopLevelSectionFromImplSpecs(
  menuItem: CreateSectionsContextMenuInfo,
  position: Position | null = null,
) {
  void createTopLevelSectionWithResult({
    implType: menuItem.implSpecs.type,
    controlCodeObjType: menuItem.controlCodeObjType,
    implOverrides: menuItem.implSpecs,
    position,
  }).then((createdSection) => {
    if (!createdSection) {
      return;
    }
    const { sectionId, metaControlParamId } = createdSection;
    if (menuItem.controlParamConfig) {
      void applyMetaControlParamConfigAfterCreate(
        sectionId,
        metaControlParamId,
        menuItem.controlParamConfig,
      );
    }
    if (menuItem.implSpecs.type === SectionTypeEnum.Callable) {
      focusOnSectionSearch(sectionId);
    }
  });
}

async function applyMetaControlParamConfigAfterCreate(
  sectionId: string,
  controlParamId: string | null,
  config: CreateSectionsContextMenuInfo["controlParamConfig"],
) {
  if (!controlParamId || !config) {
    return;
  }
  const response = await route_update_param_impl_config({
    projectConfigId: getCurrProjectConfigId(),
    sectionId,
    paramInfoId: controlParamId,
    newConfig: config,
  });
  if (!res200(response)) {
    addTemporaryNotification(
      getErrorDetail(response.data) ??
        "Failed to apply meta control configuration after section creation.",
      SettaNotificationTypeEnum.error,
    );
  }
}
