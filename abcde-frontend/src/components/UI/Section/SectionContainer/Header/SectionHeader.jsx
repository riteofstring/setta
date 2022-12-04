import { Spacer, Stack } from "@chakra-ui/react";
import React from "react";
import { deleteChild } from "thunks/deleteChild";
import Incrementer from "../Incrementer/Incrementer";
import CustomCloseButton from "./CustomCloseButton/CustomCloseButton";
import SectionTitle from "./Title/SectionTitle";

function _SectionHeader({
  sectionId,
  parentId,
  nextId,
  isSeriesElement,
  isRoot,
  hasNested,
}) {
  const onCustomCloseButtonClick = (e) => {
    // ignore onClick events in parent components
    // https://stackoverflow.com/questions/60811792/react-how-to-ignore-onclick-for-child-element
    e.stopPropagation();
    deleteChild({ sectionId: parentId, startId: sectionId });
  };

  return (
    <Stack direction="row" align="center" w="100%" pl="0.75em">
      <CardTitle sectionId={sectionId} />
      <Spacer />
      {(isSeriesElement || isRoot) && (
        <Incrementer
          sectionId={sectionId}
          parentId={parentId}
          nextId={nextId}
          isRoot={isRoot}
          hasNested={hasNested}
        />
      )}
      <CustomCloseButton
        onClick={onCustomCloseButtonClick}
        aria-label="Delete self"
        data-testid={`Delete ${sectionId}`}
      />
    </Stack>
  );
}

function CardTitle({ sectionId }) {
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
