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

  function totalRef(e) {
    refForPosition.current = e;
    droppableRef && droppableRef(e);
    draggableRef && draggableRef(e);
  }

  const commonProps = { ref: totalRef, ...trueDragListeners };

  if (isDeck) {
    return (
      <div
        className={`${className} flex min-w-[450px] flex-col items-stretch rounded-3xl px-8 py-3`}
        style={{
          backgroundColor: "hsla(212, 22%, 50%, 0.2)",
          ...style,
        }}
        {...commonProps}
      >
        <DeckSectionTitle sectionId={sectionId} />
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
      "nodrag flex-1 -mx-4 px-4 bg-[#64748b83] font-heading font-bold text-4xl rounded-full tracking-tighter cursor-auto",

    notEditing:
      "font-heading flex-1 font-bold text-slate-100 text-4xl -mx-4 px-4 tracking-tighter",
  };

  return <SectionTitle sectionId={sectionId} titleProps={titleProps} />;
}
