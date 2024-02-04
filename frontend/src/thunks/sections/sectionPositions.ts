import _ from "lodash";
import { useProjectConfig } from "models/info/projectConfig";
import { useSectionInfos } from "models/info/sectionInfos";
import { maybeIncrementProjectStateVersion } from "thunks/undo";
import { SectionType } from "z_utils/types/section";

export function setZIndices(inputNodes: SectionType[], incrementVersion) {
  const nodes = inputNodes.filter((x) => x.id);
  const s = useSectionInfos.getState();
  const pc = useProjectConfig.getState();
  const topLevelSectionIdsExcludingInputIds = pc.children.filter(
    (x) => !nodes.map((x) => x.id).includes(x),
  );

  const posWithIds = _.map(topLevelSectionIdsExcludingInputIds, (id) => ({
    id,
    zIndex: s.x[id].zIndex,
  }));
  posWithIds.sort((a, b) => a.zIndex - b.zIndex); //sort in increasing order of zindex

  const newValues = {};
  for (let i = 0; i < posWithIds.length; i++) {
    newValues[posWithIds[i].id] = { zIndex: i };
  }
  for (let i = 0; i < nodes.length; i++) {
    if (!pc.children.includes(nodes[i].id)) {
      continue;
    }
    newValues[nodes[i].id] = { zIndex: i + posWithIds.length };
  }

  s.setSectionInfoAttrObjInput({ newValues });
  maybeIncrementProjectStateVersion(incrementVersion);
}

