import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import React from "react";
import { openDeckContextMenu } from "state/actions/contextMenus";
import { useSectionRefAndInit } from "state/hooks/sectionRef";
import { useTempHasNested } from "state/hooks/sections";
import { SectionTitle } from "../Header/SectionTitle";

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
  const refForPosition = useSectionRefAndInit(sectionId, "withNested");
  const hasNested = useTempHasNested(sectionId);
  function totalRef(e) {
    refForPosition.current = e;
    droppableRef && droppableRef(e);
    draggableRef && draggableRef(e);
  }

  const commonProps = { ref: totalRef, ...trueDragListeners };
  const width = "";
  const moveSectionActivationKeyPressed = useReactFlow(
    (x) => x.moveSectionActivationKeyPressed,
  );

  const pointerSelectCSS = moveSectionActivationKeyPressed
    ? "pointer-events-none select-none"
    : "";

  // transition-all active:shadow-lg
  if (isDeck) {
    return (
      <div
        className={`${pointerSelectCSS} flex ${width} flex-[0_0_auto] flex-col items-stretch px-6 pb-6 pt-3  ${className}`}
        {...commonProps}
        onContextMenu={(e) => openDeckContextMenu(e, sectionId)}
      >
        <div className="absolute left-0 right-0 top-0 z-0 h-full w-full rounded-3xl border border-solid border-[#ffffff62] bg-[#515f7056] outline outline-2  outline-transparent backdrop-blur dark:border-setta-700 dark:bg-[#06070a3e]" />
        <div className="relative w-full min-w-0">
          <DeckSectionTitle sectionId={sectionId} />
        </div>

        {!hasNested && (
          <div className="z-10 -mx-4 mt-4 flex flex-row items-center justify-center rounded-xl border-4 border-dashed border-setta-300 px-4 py-3 text-setta-300 dark:border-setta-800 dark:text-white">
            Drop A Card Here.
          </div>
        )}

        {children}
      </div>
    );
  }
  return (
    <div
      className={`${pointerSelectCSS} ${className}`}
      style={style}
      {...commonProps}
    >
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
  const className = "max-w-";
  const titleProps = {
    editing:
      "nodrag w-full cursor-auto bg-[#64748b83] dark:bg-setta-900 font-heading text-2xl font-bold tracking-tighter text-setta-100 dark:text-setta-500",

    notEditing:
      "cursor-pointer truncate font-heading text-2xl font-bold tracking-tighter text-setta-100 dark:text-setta-600 cursor-pointer",
  };

  return <SectionTitle sectionId={sectionId} titleProps={titleProps} />;
}
