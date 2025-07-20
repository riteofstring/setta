import _ from "lodash";
import { addTemporaryNotification } from "state/actions/notifications";
import { useProjectState, ZustandProjectState } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import {
  route_new_json_version_name,
  route_save_section_json_source,
} from "utils/generatedEndpoints";
import {
  BaseCodeObjImplUnion,
  BaseSectionImplUnion,
  BaseSectionWithParamsImpl,
  createBaseCodeObjLayeringUnionWithDiscriminator,
  createBaseSectionLayeringUnionWithDiscriminator,
  isBaseSectionWithParamsImpl,
} from "utils/generatedTypes";
import { createNewId, createRandomName } from "utils/idNameCreation";
import { maybeRunGuiToYaml } from "./guiToYaml";
import {
  getSectionImpl,
  getSectionVariant,
  setEffectiveImplValue,
} from "./sectionInfos";

export function createNewSectionVersion(
  p: ZustandProjectState,
  sectionId: string,
) {
  const currImpl = getSectionImpl(p, sectionId);
  let newImpl: BaseSectionImplUnion;
  if (currImpl.isPreset) {
    newImpl = currImpl;
  } else {
    newImpl = _.cloneDeep({
      ...currImpl,
      id: createNewId(),
      name: createRandomName(),
    });
  }
  const newImplLayering = createBaseSectionLayeringUnionWithDiscriminator({
    type: newImpl.type,
    impl: newImpl.id,
  });
  const section = p.sections[sectionId];
  if (!section) {
    throw new Error();
  }

  if (isBaseSectionWithParamsImpl(newImpl)) {
    const newCodeObjImplLayeringMap: BaseSectionWithParamsImpl["codeObjImplLayeringMap"] =
      {};
    for (const [codeObjId, codeObjLayeringId] of Object.entries(
      newImpl.codeObjImplLayeringMap,
    )) {
      newCodeObjImplLayeringMap[codeObjId] = createNewCodeObjVersion(
        p,
        codeObjId,
        codeObjLayeringId,
      );
    }
    setEffectiveImplValue<"BaseSectionWithParams">(
      newImpl,
      section,
      newImplLayering,
      {
        codeObjImplLayeringMap: newCodeObjImplLayeringMap,
      },
    );
  }

  section.implLayerings.push(newImplLayering.id);
  p.sectionImpls[newImpl.id] = newImpl;
  p.sectionImplLayerings[newImplLayering.id] = newImplLayering;
  p.projectConfig.sectionImplLayeringMap[sectionId] = newImplLayering.id;
  addTemporaryNotification("New Version Created");
}

function createNewCodeObjVersion(
  p: ZustandProjectState,
  codeObjId: string,
  codeObjLayeringId: string,
) {
  const layering = p.codeObjImplLayerings[codeObjLayeringId];
  if (!layering) {
    throw new Error();
  }
  const currImpl = p.codeObjImpls[layering.impl];
  if (!currImpl) {
    throw new Error();
  }
  let newImpl: BaseCodeObjImplUnion;
  if (currImpl.isPreset) {
    newImpl = currImpl;
  } else {
    newImpl = _.cloneDeep({
      ...currImpl,
      id: createNewId(),
      name: createRandomName(),
    });
  }
  const newImplLayering = createBaseCodeObjLayeringUnionWithDiscriminator({
    type: newImpl.type,
    impl: newImpl.id,
  });

  const codeObj = p.codeObjs[codeObjId];
  if (!codeObj) {
    throw new Error();
  }
  codeObj.implLayerings.push(newImplLayering.id);
  p.codeObjImpls[newImpl.id] = newImpl;
  p.codeObjImplLayerings[newImplLayering.id] = newImplLayering;
  return newImplLayering.id;
}

async function maybeSaveNewJSONVersion(
  newVariantId: string,
  isJsonSource: boolean,
) {
  if (isJsonSource) {
    const { sections, codeInfoCols, variants, codeInfo } =
      useProjectState.getState();
    await route_save_section_json_source({
      project: { sections, codeInfoCols, variants, codeInfo },
      variantId: newVariantId,
    });
  }
  addTemporaryNotification("New Version Created");
}

async function createNewVersionName(currName, isJsonSource) {
  if (isJsonSource) {
    const res = await route_new_json_version_name({ filename: currName });
    if (res200(res)) {
      return res.data;
    }
  }
  return createRandomName();
}

export async function createNewVersionMaybeWithJSON(sectionId) {
  const { name, isJsonSource } = getSectionVariant(sectionId);
  const newVersionName = await createNewVersionName(name, isJsonSource);
  let newVariantId;
  useProjectState.setState((state) => {
    ({ newVariantId } = createNewSectionVersion(
      sectionId,
      newVersionName,
      state,
    ));
  });
  maybeRunGuiToYaml(sectionId, newVariantId);
  maybeSaveNewJSONVersion(newVariantId, isJsonSource);
}
