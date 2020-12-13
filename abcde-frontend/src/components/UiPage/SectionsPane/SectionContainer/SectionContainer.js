import React, { useEffect, useState } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import SectionHeading from "./SectionElements/SectionHeading";
import { Flex, HStack } from "@chakra-ui/react";
import SectionUI from "./SectionElements/SectionUI";
import NestedSection from "./NestedSection";
import { createStringId } from "../../../../utils/sectionIds";
import Breadcrumbs from "../SectionContainer/SectionElements/Breadcrumbs/Breadcrumbs";
import NestedIncrementer from "./SectionElements/NestedIncrementer";
import { motion } from "framer-motion";
import { usePositionReorder } from "../../../../utils/framerDragPos/usePositionReorder";

const Draggable = motion.custom(Flex);

const SectionContainer = ({
  sectionId,
  rootId,
  parentId,
  childrenIds,
  theSection,
  depth,
  idx,
}) => {
  const setCurr = useStoreActions((actions) => actions.globalCurr.setCurr);
  const setSectionId = useStoreActions(
    (actions) => actions.globalCurr.setSectionId
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

  console.log("SectionContainer", theSection.name, ref);

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

  const maybeIncludeNestedIncrementer = () => {
    if (isList) {
      return (
        <NestedIncrementer
          sectionId={sectionId}
          parentId={parentId}
          isListRoot={isListRoot}
        />
      );
    }
    return <></>;
  };

  const getSectionHeadingAndUI = () => {
    if (!isListRoot) {
      return (
        <>
          <HStack mb="1rem">
            <SectionHeading heading={theSection.name} />
            {maybeIncludeNestedIncrementer()}
          </HStack>
          <SectionUI
            sectionId={sectionId}
            theSection={theSection}
            sectionModuleObjHasNested={sectionModuleObjHasNested}
          />
        </>
      );
    } else {
      return (
        <HStack mb="1rem">
          <SectionHeading heading={"List for " + theSection.name} />
          {maybeIncludeNestedIncrementer()}
        </HStack>
      );
    }
  };

  const [order, updatePosition, updateOrder] = usePositionReorder(childrenIds);

  const [isDragging, setDragging] = useState(false);

  return (
    <Draggable
      direction="column"
      ml={depth === 0 && `${shiftAmount * -2.5}rem`}
      borderRadius="md"
      ref={ref ? ref : null}
      layout
      initial={false}
      style={{
        background: "white",
        borderRadius: 5,
      }}
      whileHover={{
        scale: 1.03,
        boxShadow: "0px 3px 3px rgba(0,0,0,0.15)",
      }}
      whileTap={{
        scale: 1.12,
        boxShadow: "0px 5px 5px rgba(0,0,0,0.1)",
      }}
      drag="y"
      onDragStart={() => setDragging(true)}
      onDragEnd={() => setDragging(false)}
      onViewportBoxUpdate={(_viewportBox, delta) => {
        isDragging && updateOrder(idx, delta.y.translate);
      }}
    >
      {rootId === sectionId && sectionModuleObjHasNested > 0 && (
        <Breadcrumbs rootId={rootId} />
      )}
      <Flex
        width="100%"
        bg={inFocus ? "gray.50" : "white"}
        onClick={() => applyFocus()}
        direction="column"
        padding="1rem 1.25rem"
        my="0.5rem"
        borderRadius="md"
        border="1px"
        borderColor="gray.200"
        id={sectionId}
      >
        {getSectionHeadingAndUI()}
      </Flex>
      {childrenIds.length > 0 &&
        childrenIds.map((e, idx) => (
          <NestedSection
            parentId={sectionId}
            rootId={rootId}
            sectionId={e}
            idx={idx}
            key={`Nested-Sec-${e}-${idx}`}
            depth={depth + 1}
            childrenIds={childrenIds}
            updatePosition={updatePosition}
          />
        ))}
    </Draggable>
  );
};

export default React.memo(SectionContainer);
