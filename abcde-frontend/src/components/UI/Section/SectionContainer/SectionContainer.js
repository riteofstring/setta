import React, { useEffect } from "react";
import { Stack } from "@chakra-ui/react";
import { useStoreActions, useStoreState } from "easy-peasy";
import GroupContainer from "../Main/Group/GroupContainer";
import SectionSearch from "../Main/Search/Search";
import SectionHeader from "../Header/SectionHeader";
import SectionFooter from "../Footer/SectionFooter";
import { createStringId } from "../../../../utils/sectionIds";
import { usePositionReorder } from "../../../../utils/usePositionReorder";

export default function SectionContainer({
  sectionId,
  rootId,
  parentId,
  nextId,
  childrenIds,
  theSection,
  depth,
}) {
  const setCurr = useStoreActions((actions) => actions.globalCurr.setCurr);
  const setSectionId = useStoreActions(
    (actions) => actions.globalCurr.setSectionId
  );

  const setChildrenIds = useStoreActions(
    (action) => action.master.setChildrenIds
  );

  const selected = useStoreState((state) => state.master.selected[sectionId]);
  const stringId = createStringId(
    sectionId,
    selected.moduleName,
    selected.name
  );
  const sectionModuleObjHasNested = useStoreState(
    (state) => state.master.sectionModuleObjHasNested[stringId]
  );
  const shiftAmount = useStoreState(
    (state) => state.master.shiftAmount[sectionId]
  );

  const setShiftAmount = useStoreActions(
    (actions) => actions.master.setShiftAmount
  );
  const setInFocus = useStoreActions((actions) => actions.master.setInFocus);
  const inFocus = useStoreState((state) => state.master.inFocus[sectionId]);

  const isList = useStoreState((state) => state.master.isList[sectionId]);
  const isListRoot = useStoreState(
    (state) => state.master.isListRoot[sectionId]
  );

  const [order, updatePosition, updateOrder] = usePositionReorder(childrenIds);
  const applyFocus = () => {
    if (!inFocus) {
      setInFocus(sectionId);
      setSectionId(sectionId);
      setShiftAmount({ rootId, shiftAmount: depth });
    }
  };

  useEffect(() => {
    if (inFocus) {
      const { moduleName, name: objName } = selected;
      if (moduleName !== undefined) {
        setCurr({ moduleName, objName });
      }
    }
  }, [inFocus, selected, setCurr]);

  useEffect(() => {
    if (order.length > 0) {
      setChildrenIds({ sectionId, childrenIds: order });
    }
  }, [order]);

  const getSearchItems = () => {
    const { moduleInfos } = theSection;
    let output = [];
    for (let moduleName of Object.keys(moduleInfos)) {
      for (let objName of Object.keys(moduleInfos[moduleName].objs)) {
        output.push([moduleName, objName]);
      }
    }
    return output;
  };

  const searchItems = getSearchItems();

  return (
    <Stack
      bg="gray.50"
      px="1.5rem"
      py="1rem"
      borderRadius="md"
      w="700px"
      onClick={() => applyFocus()}
    >
      <SectionHeader
        theSection={theSection}
        sectionId={sectionId}
        isListRoot={true}
      />
      <SectionSearch sectionId={sectionId} items={searchItems} />
      <GroupContainer sectionId={sectionId}/>
      <SectionFooter />
    </Stack>
  );
}
