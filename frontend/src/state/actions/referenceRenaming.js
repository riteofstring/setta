import C from "constants/constants.json";
import { useSettings } from "state/definitions";
import { openRenameReferencesModal } from "./modal";

export function processRenameRefactorResults(changedValues) {
  const renameMode = useSettings.getState().backend.renameRefactorMode;
  // this shouldn't ever be true, but good to be safe I guess
  if (renameMode === C.RENAME_REFACTOR_NEVER_RENAME) {
    return;
  }
  if (renameMode === C.RENAME_REFACTOR_ALWAYS_ASK) {
    openRenameReferencesModal(changedValues);
    return;
  }

  makeReplacements(changedValues);
}

export async function makeReplacements(changedValues) {
  console.log("makeReplacements", changedValues);
  // const res = await dbMakeReplacements(
  //   codeAreaReplacements,
  //   codeInfoReplacements,
  //   paramEVReplacements,
  // );
  // if (res.status === 200) {
  //   const { newCodeAreaValues, newCodeInfoValues, newParamEVValues } = res.data;
  //   useSectionInfos.setState((state) => {
  //     let curr;
  //     for (const [variantId, newData] of Object.entries(newCodeAreaValues)) {
  //       curr = state.variants[variantId];
  //       curr.code = newData[0];
  //     }
  //     for (const [codeInfoId, newData] of Object.entries(newCodeInfoValues)) {
  //       curr = state.codeInfo[codeInfoId];
  //       curr.name = newData[0];
  //     }
  //     for (const [variantId, params] of Object.entries(newParamEVValues)) {
  //       for (const [referringParamInfoId, newData] of Object.entries(params)) {
  //         curr = state.variants[variantId].values[referringParamInfoId];
  //         curr.value = newData[0];
  //       }
  //     }
  //   });
  // }
}
