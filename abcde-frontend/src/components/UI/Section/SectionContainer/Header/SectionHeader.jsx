import { useIsInfo } from "hooks/useSectionType";
import React from "react";
import { FiSave } from "react-icons/fi";
import { saveKwargsAsCollection } from "thunks/kwargs";
import { deleteChild } from "thunks/sections/deleteChild";
import { IconButton } from "utils/atoms/buttons/IconButton";
import { Incrementer } from "../Incrementer/Incrementer";
import { CustomCloseButton } from "./CustomCloseButton/CustomCloseButton";
import { SectionTitle } from "./Title/SectionTitle";

function _SectionHeader({
  sectionId,
  parentId,
  nextId,
  isSeriesElement,
  isRoot,
  hasNested,
}) {
  const isInfo = useIsInfo(sectionId);
  const onCustomCloseButtonClick = (e) => {
    // ignore onClick events in parent components
    // https://stackoverflow.com/questions/60811792/react-how-to-ignore-onclick-for-child-element
    e.stopPropagation();
    deleteChild({ parentId, startId: sectionId });
  };

  function onClickSaveAsCollection() {
    saveKwargsAsCollection({ sectionId, objInfoId });
  }
  return (
    <div className="flex flex-row items-center px-9">
      {!isInfo && (
        <div className="align-self-stretch flex w-full flex-1 items-center gap-1 justify-self-stretch ">
          <CardTitle sectionId={sectionId} />
          <IconButton
            color="text-slate-400"
            icon={<FiSave />}
            onClick={onClickSaveAsCollection}
          />
        </div>
      )}
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
        isInfo={isInfo}
      />
    </div>
  );
}

function CardTitle({ sectionId }) {
  const titleProps = {
    editing:
      "cursor-text nodrag h-6 font-heading font-bold px-2 py-0 -ml-2 bg-slate-200 rounded-full w-full  ",
    notEditing: "font-heading cursor-pointer font-bold max-w-full truncate",
  };

  return <SectionTitle sectionId={sectionId} titleProps={titleProps} />;
}

export const SectionHeader = React.memo(_SectionHeader);
