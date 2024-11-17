import _ from "lodash";
import {
  useCodeInfo,
  useJSONSourceMissing,
  useSectionInfos,
  useSectionVariants,
} from "state/definitions";
import { getSectionInfo } from "state/getters/sectionInfo";
import { isFromJSONSource } from "utils/utils";

export function addJSONSource({ sectionId, newCodeInfos, newVariantValues }) {
  const { codeInfoId, variantIds } = getSectionInfo(sectionId);
  useCodeInfo.setState((state) => {
    const codeInfo = state.x[codeInfoId];
    codeInfo["children"].push(...Object.keys(newCodeInfos));
    for (const [k, v] of Object.entries(newCodeInfos)) {
      state.x[k] = v;
    }
  });
  console.log("useCodeInfo.getState().x", useCodeInfo.getState().x);

  useSectionVariants.setState((state) => {
    for (const variantId of variantIds) {
      const variant = state.x[variantId];
      Object.assign(variant["values"], newVariantValues);
    }
  });

  useSectionInfos.setState((state) => {
    state.x[sectionId].configLanguage = "json";
  });
}

export function removeJSONSource(sectionId) {
  const { codeInfoId } = getSectionInfo(sectionId);
  useCodeInfo.setState((state) => {
    const codeInfo = state.x[codeInfoId];
    codeInfo["children"] = codeInfo["children"].filter(
      (c) => !isFromJSONSource(c),
    );
  });

  useSectionInfos.setState((state) => {
    state.x[sectionId].configLanguage = "python";
  });
}

export function addJSONSourceMissing(sectionId) {
  useJSONSourceMissing.setState({ [sectionId]: true });
}

export function removeJSONSourceMissing(sectionId) {
  useJSONSourceMissing.setState((x) => _.omit(x, [sectionId]), true);
}
