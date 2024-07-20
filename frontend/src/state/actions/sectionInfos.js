import _ from "lodash";
import { useSectionInfos } from "state/definitions/sectionInfos";
import { useDndChildren } from "utils/DNDSortable/dndChildren";
import { isListRoot } from "z_utils/constants";

export function setAllSectionInfos({ sections }) {
  useSectionInfos.setState({ x: sections });
}

export function addSectionInfo(payload) {
  useSectionInfos.setState((state) => ({ x: payload(state.x) }));
}

export function setSectionInfoAttr({
  sectionId,
  sectionIds,
  attr,
  value,
  newValueFn,
}) {
  useSectionInfos.setState((state) => {
    if (sectionIds) {
      sectionIds.forEach((id) => {
        valueOrNewValueFn({
          obj: state.x[id],
          attr,
          value,
          newValueFn,
        });
      });
    } else if (sectionId) {
      valueOrNewValueFn({
        obj: state.x[sectionId],
        attr,
        value,
        newValueFn,
      });
    }
  });
}

export function setSectionChildren({ sectionId, newStateFn }) {
  useSectionInfos.setState((state) => {
    state.x[sectionId].children = newStateFn(state.x[sectionId].children);
  });
}

export function setSectionChildrenNames({ sectionId, sectionType }) {
  useSectionInfos.setState((state) => {
    if (isListRoot(sectionType.type)) {
      const children = state.x[sectionId].children;
      for (let idx = 0; idx < children.length; idx++) {
        state.x[children[idx]].name = `[${idx}]`;
      }
    }
  });
}

export function removeSectionInfos(payload) {
  useSectionInfos.setState((state) => {
    payload.forEach((y) => {
      delete state.x[y];
    });
    for (const [k, v] of Object.entries(state.x)) {
      state.x[k].children = v.children.filter((x) => !payload.includes(x));
      if (payload.includes(v.paramSweepSectionId)) {
        state.x[k].paramSweepSectionId = null;
      }
    }
  });
}

export function updateSections(payload) {
  useSectionInfos.setState((state) => {
    state.x = { ...state.x, ...payload };
  });
}

export function setSectionResizeEvent({ sectionId, resizeEvent }) {
  useSectionInfos.setState((state) => {
    state.x[sectionId].resizeEvent = resizeEvent;
  });
}

export function toggleSectionOrientation({ sectionId }) {
  useSectionInfos.setState((state) => {
    state.x[sectionId].isHorizontalOrientation =
      !state.x[sectionId].isHorizontalOrientation;
  });
}

function valueOrNewValueFn({ obj, attr, value, newValueFn }) {
  if (newValueFn) {
    obj[attr] = newValueFn(obj[attr]);
  } else {
    obj[attr] = value;
  }
}

export function manualDndChildrenReset() {
  useDndChildren
    .getState()
    .reset(_.mapValues(useSectionInfos.getState().x, (v) => v.children));
}
