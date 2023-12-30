import { useHasNested } from "hooks/useSectionChildren";
import _ from "lodash";
import { useSectionRefs } from "models/sectionRefs";
import React, { useEffect, useRef } from "react";
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
        className={`flex min-w-[518px] flex-col items-stretch px-8 pt-3 pb-6  ${className}`}
        {...commonProps}
      >
        <div className="absolute top-0 left-0 right-0 z-0 h-full w-full rounded-3xl border border-solid border-[#ffffff62] bg-[#515f7056] outline outline-2  outline-transparent backdrop-blur dark:border-runcoder-700 dark:bg-[#00020daf]" />
        <div className="relative z-10 h-10">
          <DeckSectionTitle sectionId={sectionId} />
        </div>
        {!hasNested && (
          <div className="z-10 -mx-4 mt-4 flex items-center justify-center rounded-xl border-4 border-dashed border-slate-300 py-3 px-4 text-slate-300 dark:border-runcoder-800 dark:text-white">
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
  // TRY TO ELIMINATE ABOVE USELESS DIV
  // if (className || (style && Object.keys(style).length > 0)) {
  //   return (
  //     <div className={className} style={style} {...commonProps}>
  //       {children}
  //     </div>
  //   );
  // }
  // return React.cloneElement(children, commonProps);
}

export const Container = React.memo(_Container, _.isEqual);

function DeckSectionTitle({ sectionId }) {
  const titleProps = {
    editing:
      "absolute nodrag -mx-4 w-full cursor-auto self-stretch rounded-full bg-[#64748b83] px-4 font-heading text-4xl font-bold tracking-tighter text-slate-100",

    notEditing:
      "absolute -mx-4 w-full truncate px-4 font-heading text-4xl font-bold tracking-tighter text-slate-100",
  };

  return <SectionTitle sectionId={sectionId} titleProps={titleProps} />;
}

function useSectionRefAndInit(sectionId) {
  const ref = useRef(null);

  useEffect(() => {
    useSectionRefs.getState().setRef({ sectionId, ref: ref.current });
  }, []);

  return ref;
}
