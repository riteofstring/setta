import { useDndChildren } from "forks/dnd-kit/dndChildren";
import _ from "lodash";
import { useSectionInfos, useSectionVariants } from "state/definitions";
import {
  getSectionIdToChildren,
  setSectionVariantChildren,
} from "../sectionVariants";

export function setAllSectionInfos({ sections, sectionConfigs }) {
  const x = _.mapValues(sections, (v, k) => ({ ...v, ...sectionConfigs[k] }));
  useSectionInfos.setState({ x });
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

export function removeSectionInfos(payload) {
  useSectionInfos.setState((state) => {
    for (const id of payload) {
      const parentId = state.x[id]?.parentId;
      if (parentId) {
        setSectionVariantChildren({
          sectionId: parentId,
          newStateFn: (children) => children.filter((x) => x !== id),
        });
      }

      let isStillUsedInAVariant = false;
      for (const variantsInOneDbSource of Object.values(
        useSectionVariants.getState().x,
      )) {
        for (const variantInfo of Object.values(variantsInOneDbSource)) {
          if (variantInfo.children.includes(id)) {
            isStillUsedInAVariant = true;
            break;
          }
        }
        if (isStillUsedInAVariant) {
          break;
        }
      }
      if (!isStillUsedInAVariant) {
        delete state.x[id];
      }
    }

    for (const [k, v] of Object.entries(state.x)) {
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
    .update(getSectionIdToChildren(useSectionVariants.getState().x));
}

export function setAllPreviewVariantIdsToNull() {
  useSectionInfos.setState((x) => {
    for (const s of Object.values(x.x)) {
      s.previewVariantId = null;
    }
  });
}
