import { useHasNested } from "hooks/useSectionChildren";
import { useSectionRefAndInit } from "hooks/useStateRef";
import _ from "lodash";
import React from "react";
import { SectionTitle } from "../Header/Title/SectionTitle";

function _Container({
  isDeck,
  sectionId,
  droppableRef,
  draggableRef,
  className,
  style,
  trueDragListeners,
  children,
}) {
  const refForPosition = useSectionRefAndInit(sectionId);
  const hasNested = useHasNested(sectionId);
  function totalRef(e) {
    refForPosition.current = e;
    droppableRef && droppableRef(e);
    draggableRef && draggableRef(e);
  }

  const commonProps = { ref: totalRef, ...trueDragListeners };

  // transition-all active:shadow-lg
  if (isDeck) {
    return (
      <div
        className={`${className} flex min-w-[518px] flex-col items-stretch rounded-3xl border border-solid border-[#ffffff2f] bg-[#515f7056] px-8 py-3 backdrop-blur `}
        {...commonProps}
      >
        <DeckSectionTitle sectionId={sectionId} />
        {!hasNested && (
          <div className="-mx-4 mt-4 flex items-center justify-center rounded-xl border-4 border-dashed border-slate-300 py-3 px-4 text-slate-300">
            Drop A Card Here.
          </div>
        )}
        {children}
      </div>
    );
  }
  return (
    <div className={className} style={style} {...commonProps}>
      {children}
    </div>
  );
}

export const Container = React.memo(_Container, _.isEqual);

function DeckSectionTitle({ sectionId }) {
  const titleProps = {
    editing:
      "nodrag flex-1 -mx-4 px-4 bg-[#64748b83] font-heading font-bold text-4xl rounded-full tracking-tighter cursor-auto text-slate-100",

    notEditing:
      "font-heading flex-1 font-bold text-slate-100 text-4xl -mx-4 px-4 tracking-tighter",
  };

  return <SectionTitle sectionId={sectionId} titleProps={titleProps} />;
}
