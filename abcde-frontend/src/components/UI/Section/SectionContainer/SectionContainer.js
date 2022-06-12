import {
  Stack,
  Box,
  Editable,
  EditableInput,
  EditablePreview,
} from "@chakra-ui/react";
import "@chakra-ui/react";
import { useAddChild, useDeleteChild } from "hooks/useAddDeleteChild";
import { useIdsOverview } from "hooks/useIdsOverview";
import { useGetSectionType } from "hooks/useSectionType";
import React, { useState, useCallback } from "react";
import { useKeyPress } from "react-flow-renderer";
import { DECK } from "utils/constants";

import ManyNestedSections from "../NestedSection/ManyNestedSections";
import SectionContainerCore from "./SectionContainerCore";
import { useStoreActions } from "easy-peasy";
import { useEditableOnSubmit } from "hooks/useEditableOnSubmit";

function SectionContainer({
  sectionId,
  parentId,
  nextId,
  depth,
  dragListeners,
}) {
  const isDeck = useGetSectionType(sectionId).type === DECK;
  const [idsOverview, setIdsOverview] = useIdsOverview(sectionId);
  const [childrenAreCollapsed, setChildrenAreCollapsed] = useState(false);
  const hasNested = idsOverview.length > 0;
  const addChild = useAddChild(sectionId);
  const deleteChild = useDeleteChild(sectionId);
  const flipChildrenAreCollapsed = useCallback(() => {
    setChildrenAreCollapsed(!childrenAreCollapsed);
  }, [childrenAreCollapsed]);
  console.log("isDeck: ", isDeck);

  return (
    <Container
      isDeck={isDeck}
      sectionId={sectionId}
      parentId={parentId}
      dragListeners={dragListeners}
    >
      {!isDeck && (
        <SectionContainerCore
          sectionId={sectionId}
          parentId={parentId}
          nextId={nextId}
          addChild={addChild}
          deleteChild={deleteChild}
          hasNested={hasNested}
          childrenAreCollapsed={childrenAreCollapsed}
          flipChildrenAreCollapsed={flipChildrenAreCollapsed}
          dragListeners={dragListeners}
        />
      )}
      <Box
        flexDirection="column"
        display={childrenAreCollapsed ? "none" : "flex"}
      >
        {hasNested && (
          <ManyNestedSections
            childIds={idsOverview}
            sectionId={sectionId}
            depth={depth}
            setChildren={setIdsOverview}
            isDeck={isDeck}
          />
        )}
      </Box>
    </Container>
  );
}
export default React.memo(SectionContainer, (prev, next) => {
  return prev.nextId === next.nextId;
});

function Container(props) {
  const { isDeck, sectionId, parentId, dragListeners } = props;
  const ctrlPressed = useKeyPress("Control");
  const isDraggingChild = parentId && ctrlPressed;
  const trueDragListeners = isDraggingChild ? dragListeners : {};
  const className = isDraggingChild ? "nodrag" : "";
  const setSectionInfoAttr = useStoreActions(
    (x) => x.sectionInfos.setSectionInfoAttr
  );
  function onTitleInputChange(value) {
    setSectionInfoAttr({ sectionId, attr: "name", value });
  }
  const [inputValue, setInputValue, onSubmit] = useEditableOnSubmit(
    "Deck",
    onTitleInputChange
  );

  return (
    <>
      {isDeck ? (
        <Stack
          bg="hsla(212, 22%, 50%, 0.2)"
          pt=".75rem"
          px="2rem"
          pb="1.5rem"
          borderRadius="3xl"
          // border="1px solid hsla(255, 22%, 100%, 0.3)"
          // boxShadow="xs"
        >
          <Editable
            fontFamily="Work Sans"
            fontWeight="bold"
            color="gray.100"
            fontSize="4xl"
            mb="-.5rem"
            letterSpacing="tighter"
            value={inputValue}
            onChange={setInputValue}
            onSubmit={onSubmit}
          >
            <EditablePreview />
            <EditableInput
              className="nodrag"
              w="450px"
              letterSpacing="tighter"
            />
          </Editable>
          {props.children}
        </Stack>
      ) : (
        <Stack {...trueDragListeners} className={className}>
          {props.children}
        </Stack>
      )}
    </>
  );
}
