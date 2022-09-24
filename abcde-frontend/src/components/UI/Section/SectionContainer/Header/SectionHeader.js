import { Spacer, Stack } from "@chakra-ui/react";
import { useDeleteChild } from "hooks/useAddDeleteChild";
import React from "react";

import Incrementer from "../Incrementer/Incrementer";
import CustomCloseButton from "./CustomCloseButton";
import SectionTitle from "./Title/SectionTitle";

function _SectionHeader({
  sectionId,
  parentId,
  nextId,
  isList,
  isListRoot,
  requiresKeyInput,
  addChild,
  deleteChild,
  hasNested,
}) {
  const deleteSelf = useDeleteChild(parentId);

  const onCustomCloseButtonClick = () => {
    deleteSelf({ startId: sectionId });
  };

  return (
    <Stack direction="row" align="center" w="100%" pl="0.75em">
      <NonDeckSectionTitle sectionId={sectionId} />
      <Spacer />
      {(isList || isListRoot) && (
        <Incrementer
          sectionId={sectionId}
          parentId={parentId}
          nextId={nextId}
          isListRoot={isListRoot}
          addChild={addChild}
          deleteChild={deleteChild}
          hasNested={hasNested}
        />
      )}
      <CustomCloseButton
        onClick={onCustomCloseButtonClick}
        aria-label="Delete self"
      />
    </Stack>
  );
}

function NonDeckSectionTitle({ sectionId }) {
  const editableProps = {
    isPreviewFocusable: true,
    fontFamily: "Work Sans",
    fontWeight: "bold",
    className: "nodrag",
  };

  const inputProps = {
    paddingX: "0.5rem",
    paddingY: "0",
    marginLeft: "-0.5rem",
    height: "30px",
  };
  return (
    <SectionTitle
      sectionId={sectionId}
      editableProps={editableProps}
      inputProps={inputProps}
    />
  );
}

export const SectionHeader = React.memo(_SectionHeader);
