import { useParamSweep } from "state/definitions/paramSweep";

export function setAllParamSweeps(payload) {
  useParamSweep.setState({ x: payload });
}

export function initParamSweep({ id, name }) {
  useParamSweep.setState((state) => {
    state.x[id] = { name: name, sweep: [] };
  });
}

export function setParamSweepValue({ paramSweepId, idx, valueIdx, value }) {
  useParamSweep.setState((state) => {
    state.x[paramSweepId].sweep[idx].values[valueIdx] = value;
  });
}

export function addParamSweepValue({ paramSweepId, idx }) {
  useParamSweep.setState((state) => {
    state.x[paramSweepId].sweep[idx].values.push("");
  });
}

export function deleteParamSweepValue({ paramSweepId, idx, valueIdx }) {
  useParamSweep.setState((state) => {
    const sweep = state.x[paramSweepId].sweep[idx];
    sweep.values = sweep.values.filter((x, idx) => idx !== valueIdx);
    if (sweep.values.length === 0) {
      state.x[paramSweepId].sweep = state.x[paramSweepId].sweep.filter(
        (x, i) => i !== idx,
      );
    }
  });
}

export function deleteLastParamSweepValue({ paramSweepId, idx }) {
  const { deleteValue, x } = get();
  deleteValue({
    paramSweepId,
    idx,
    valueIdx: x[paramSweepId].sweep[idx].values.length - 1,
  });
}

export function changeParamSweepParamInfoId({
  paramSweepId,
  idx,
  paramInfoId,
  evColId,
}) {
  useParamSweep.setState((state) => {
    if (paramInfoId) {
      state.x[paramSweepId].sweep[idx] = { paramInfoId, values: [""] };
    } else if (evColId) {
      state.x[paramSweepId].sweep[idx] = { evColId };
    }
  });
}

export function addParamSweepParamInfoId({
  paramSweepId,
  paramInfoId,
  evColId,
}) {
  useParamSweep.setState((state) => {
    if (paramInfoId) {
      state.x[paramSweepId].sweep.push({ paramInfoId, values: [""] });
    } else if (evColId) {
      state.x[paramSweepId].sweep.push({ evColId });
    }
  });
}
