import React, { useEffect } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import SectionHeading from "./SectionElements/SectionHeading";
import { Flex, HStack } from "@chakra-ui/react";
import SectionUI from "./SectionElements/SectionUI";
import NestedSection from "./NestedSection";
import { createStringId } from "../../../../utils/sectionIds";
import Breadcrumbs from "../SectionContainer/SectionElements/Breadcrumbs/Breadcrumbs";
import NestedIncrementer from "./SectionElements/NestedIncrementer";
import { usePositionReorder } from "../../../../utils/usePositionReorder";

const SectionContainer = ({
  sectionId,
  rootId,
  parentId,
  childrenIds,
  theSection,
  depth,
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
            <SectionHeading theSection={theSection} sectionId={sectionId} />
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
          <SectionHeading
            theSection={theSection}
            sectionId={sectionId}
            isListRoot={true}
          />
          {maybeIncludeNestedIncrementer()}
        </HStack>
      );
    }
  };
  const [order, updatePosition, updateOrder] = usePositionReorder(childrenIds);

  return (
    <Flex
      direction="column"
      ml={depth === 0 && `${shiftAmount * -2.5}rem`}
      borderRadius="md"
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

      {order.length > 0 &&
        order.map((e, idx) => (
          <NestedSection
            parentId={sectionId}
            rootId={rootId}
            sectionId={e}
            idx={idx}
            key={`Nested-Sec-${e}`}
            depth={depth + 1}
            updatePosition={updatePosition}
            updateOrder={updateOrder}
          />
        ))}
    </Flex>
  );
};

export default React.memo(SectionContainer);
