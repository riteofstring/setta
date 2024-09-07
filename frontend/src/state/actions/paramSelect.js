import { batchUpdateCodeInfoChildren } from "state/actions/codeInfo";
import {
  computeNewChildrenForLeftPush,
  computeNewChildrenForRightPush,
  computeNewChildrenForVerticalPush,
  getAllSelectedParams,
} from "state/actions/kwargs/utils";
import { useParamShortcuts } from "../definitions";

export function activateParamSelect() {
  useParamShortcuts.setState({ isSelectingParams: true });
}

export function deactivateParamSelect() {
  useParamShortcuts.setState({ isSelectingParams: false });
}

export function moveSelectedParamsRight() {
  onPush(computeNewChildrenForRightPush)();
}

export function moveSelectedParamsLeft() {
  onPush(computeNewChildrenForLeftPush)();
}
export function moveSelectedParamsUp() {
  onPush(computeNewChildrenForVerticalPush("up"))();
}
export function moveSelectedParamsDown() {
  onPush(computeNewChildrenForVerticalPush("down"), true)();
}

function onPush(computeFn, processInReverse = false) {
  return () => {
    let { codeInfos, selectedParams } = getAllSelectedParams();
    if (processInReverse) {
      selectedParams.reverse();
    }
    const newCodeInfoChildren = {};
    const numChildrenInserted = {};
    for (const p of selectedParams) {
      computeFn(codeInfos, p, newCodeInfoChildren, numChildrenInserted);
    }
    batchUpdateCodeInfoChildren(newCodeInfoChildren);
  };
}
