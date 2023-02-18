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
        className={`${className} rounded-3xl px-8 pt-3 pb-6`}
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
    editing: "nodrag w-[450px] font-bold text-4xl -mb-2 tracking-tighter",

    notEditing:
      "font-heading font-bold text-slate-100 text-4xl -mb-2 tracking-tighter",
  };

  return (
    <SectionTitle
      sectionId={sectionId}
      titleProps={titleProps}
      className="12345"
    />
  );
}
