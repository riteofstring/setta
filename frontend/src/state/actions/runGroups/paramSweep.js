import { useParamSweep } from "state/definitions";
import { getSectionInfo } from "state/getters/sectionInfo";

export function setAllParamSweeps(payload) {
  useParamSweep.setState({ x: payload });
}

export function initParamSweep({ id, name }) {
  useParamSweep.setState((state) => {
    state.x[id] = { name, sweep: [] };
  });
}

export function addParamSweepCallable({ paramSweepId }) {
  useParamSweep.setState((state) => {
    state.x[paramSweepId].sweep.push({ selectedItem: null, params: [] });
  });
}

export function setParamSweepSelectedItem({
  paramSweepId,
  selectedItemIdx,
  selectedItem,
}) {
  useParamSweep.setState((x) => {
    x.x[paramSweepId].sweep[selectedItemIdx].selectedItem = selectedItem;
  });
}

export function setParamSweepValue({
  paramSweepId,
  selectedItemIdx,
  paramIdx,
  valueIdx,
  value,
}) {
  useParamSweep.setState((state) => {
    state.x[paramSweepId].sweep[selectedItemIdx].params[paramIdx].values[
      valueIdx
    ] = value;
  });
}

export function addParamSweepValue({
  paramSweepId,
  selectedItemIdx,
  paramIdx,
}) {
  useParamSweep.setState((state) => {
    state.x[paramSweepId].sweep[selectedItemIdx].params[paramIdx].values.push(
      "",
    );
  });
}

export function deleteParamSweepValue({
  paramSweepId,
  selectedItemIdx,
  paramIdx,
  valueIdx,
}) {
  useParamSweep.setState((state) => {
    const s = state.x[paramSweepId].sweep[selectedItemIdx];
    s.params[paramIdx].values = s.params[paramIdx].values.filter(
      (_, idx) => idx !== valueIdx,
    );
    if (s.params[paramIdx].values.length === 0) {
      s.params = s.params.filter((_, idx) => idx !== paramIdx);
    }
  });
}

export function deleteLastParamSweepValue({
  paramSweepId,
  selectedItemIdx,
  paramIdx,
}) {
  const valueIdx =
    useParamSweep.getState().x[paramSweepId].sweep[selectedItemIdx].params[
      paramIdx
    ].values.length - 1;
  deleteParamSweepValue({
    paramSweepId,
    selectedItemIdx,
    paramIdx,
    valueIdx,
  });
}

export function changeParamSweepParamInfoId({
  paramSweepId,
  selectedItemIdx,
  paramIdx,
  paramInfoId,
}) {
  useParamSweep.setState((state) => {
    state.x[paramSweepId].sweep[selectedItemIdx].params[paramIdx] = {
      paramInfoId,
      values: [""],
    };
  });
}

export function addParamSweepParamInfoId({
  paramSweepId,
  selectedItemIdx,
  paramInfoId,
}) {
  let actualSelectedItemIdx = selectedItemIdx;
  if (actualSelectedItemIdx === null) {
    // special case for a section without callables
    // that has no params yet.
    addParamSweepCallable({ paramSweepId });
    actualSelectedItemIdx = 0;
  }

  useParamSweep.setState((state) => {
    state.x[paramSweepId].sweep[actualSelectedItemIdx].params.push({
      paramInfoId,
      values: [""],
    });
  });
}

export function deleteLastParamSweepParamInfoId({
  paramSweepId,
  selectedItemIdx,
}) {
  if (selectedItemIdx === null) {
    // special case for a section without callables
    // that has no params yet.
    return;
  }
  useParamSweep.setState((state) => {
    const s = state.x[paramSweepId];
    if (s.sweep[selectedItemIdx].params.length === 0) {
      s.sweep = s.sweep.filter((_, idx) => idx !== selectedItemIdx);
    } else {
      s.sweep[selectedItemIdx].params.pop();
    }
  });
}

export function deleteParamsFromParamSweep({ sectionId, ids }) {
  const { paramSweepId } = getSectionInfo(sectionId);
  if (paramSweepId) {
    useParamSweep.setState((x) => {
      for (const s of x.x[paramSweepId].sweep) {
        s.params = s.params.filter((y) => !ids.includes(y.paramInfoId));
      }
    });
  }
}

export function updateParamSweeps(payload) {
  useParamSweep.setState((state) => {
    state.x = { ...state.x, ...payload };
  });
}
