import { useStoreActions } from "easy-peasy";
import React from "react";
import Incrementer from "../Incrementer/Incrementer";
import CustomCloseButton from "./CustomCloseButton";
import SectionTitle from "./Title/SectionTitle";

function _SectionHeader({
  sectionId,
  parentId,
  nextId,
  isSeriesElement,
  isRoot,
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
    <div className="flex flex-row items-center w-full pl-3">
      <CardTitle sectionId={sectionId} />
      <div className="flex-1 justify-self-stretch align-self-stretch" />
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
    </div>
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
