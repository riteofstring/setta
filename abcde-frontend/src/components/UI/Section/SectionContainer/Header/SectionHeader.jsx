import { Spacer, Stack } from "@chakra-ui/react";
import { useStoreActions } from "easy-peasy";
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
  hasNested,
}) {
  const deleteChild = useStoreActions((x) => x.thunks.deleteChild);

  const onCustomCloseButtonClick = (e) => {
    // ignore onClick events in parent components
    // https://stackoverflow.com/questions/60811792/react-how-to-ignore-onclick-for-child-element
    e.stopPropagation();
    deleteChild({ sectionId: parentId, startId: sectionId });
  };

  return (
    <Stack direction="row" align="center" w="100%" pl="0.75em">
      <CardTitle sectionId={sectionId} isList={isList} />
      <Spacer />
      {(isList || isListRoot) && (
        <Incrementer
          sectionId={sectionId}
          parentId={parentId}
          nextId={nextId}
          isListRoot={isListRoot}
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

function CardTitle({ sectionId, isList }) {
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
      isList={isList}
    />
  );
}

export const SectionHeader = React.memo(_SectionHeader);
