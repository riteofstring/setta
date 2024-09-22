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
  useParamSweep.setState((state) => {
    state.x[paramSweepId].sweep[selectedItemIdx].params.push({
      paramInfoId,
      values: [""],
    });
  });
}

export function deleteParamsFromParamSweep({ sectionId, ids }) {
  const { paramSweepId } = getSectionInfo(sectionId);
  useParamSweep.setState((x) => {
    for (const s of x.x[paramSweepId].sweep) {
      s.params = s.params.filter((y) => !ids.includes(y.paramInfoId));
    }
  });
}
