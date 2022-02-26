import { useStoreActions, useStoreState } from "easy-peasy";
import { useGroupsHaveUpdated, useSectionGroups } from "hooks/useSectionGroups";
import { useSetSectionPosition } from "hooks/useSetSectionPosition";
import React from "react";
import ReactFlow from "react-flow-renderer";
import { MultipleContainers } from "utils/MultipleDND/MultipleContainers";
import { PANEID } from "utils/constants";

import SectionContainer from "./SectionContainer/SectionContainer";

function SectionsPane() {
  const { groupIds, setGroupIds, groups } = useSectionGroups(true);
  const spaceBetweenPages = useStoreState((x) => x.master.spaceBetweenPages);
  const refForPosition = useSetSectionPosition(PANEID);
  const setGroupChildren = useStoreActions((x) => x.master.setGroupChildren);
  const [groupsHaveUpdated, setGroupsHaveUpdated] = useGroupsHaveUpdated();

  const sections = _.concat(..._.values(groups));
  const elements = sections.map((e, idx) => ({
    id: e,
    data: {
      label: <SectionContainer sectionId={e} parentId={null} depth={0} />,
    },
    position: { x: 250, y: 100 * idx },
  }));

  console.log("elements", elements);

  return <ReactFlow elements={elements} />;

  // return (
  //   <div ref={refForPosition}>
  //     <MultipleContainers
  //       groups={groups}
  //       setGroups={setGroupChildren}
  //       containers={groupIds}
  //       setContainers={setGroupIds}
  //       groupsHaveUpdated={groupsHaveUpdated}
  //       setGroupsHaveUpdated={setGroupsHaveUpdated}
  //     />
  //   </div>
  // );
}

export default React.memo(SectionsPane);
