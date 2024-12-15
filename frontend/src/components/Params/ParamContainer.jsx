import * as Accordion from "@radix-ui/react-accordion";
import { GetParamSwitch } from "components/Params/GetParamSwitch";
import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import _ from "lodash";
import React, { useEffect, useRef } from "react";
import { BiChevronUp } from "react-icons/bi";
import { HiOutlineDuplicate } from "react-icons/hi";
import { toggleParamSelected } from "state/actions/kwargs";
import { getDisplayedCodeInfoCol } from "state/actions/sectionInfos";
import {
  useMisc,
  useProjectSearch,
  useSectionColumnWidth,
  useSectionInfos,
  useTypeErrors,
} from "state/definitions";
import { createProjectSearchLookupKey } from "state/hooks/search";
import { ParamInput } from "./ParamItems/ParamInput";
import { ResizeHandle } from "./ResizeHandle";

function _ParamContainer({
  sectionId,
  paramInfoId,
  requiredParamIdsToPaths,
  ancestorIsSelected,
  children,
  onResizeStart,
  isKwarg = false,
  isTopLevelWithPad,
}) {
  const maybeErrorMessage = useTypeErrors(
    (x) => x.errors[sectionId]?.[paramInfoId],
  );

  // const maybeErrorMessage = useTypeErrors((x) => "error");
  const { isFocusedSearchResult, isSearchResult } = useProjectSearch((x) => {
    return {
      isFocusedSearchResult:
        x.focused.sectionId === sectionId &&
        x.focused.paramInfoId === paramInfoId,
      isSearchResult: x.lookup.has(
        createProjectSearchLookupKey(sectionId, paramInfoId),
      ),
    };
  }, _.isEqual);

  // warnings should be AMBER
  const border = maybeErrorMessage
    ? "bg-red-200 dark:bg-red-800/30"
    : isFocusedSearchResult
      ? "outline outline-4 outline-green-500 dark:outline-green-500/80"
      : isSearchResult
        ? "outline outline-4 outline-blue-500 dark:outline-cyan-300/80"
        : "";

  const {
    isSelected: paramIsSelected,
    description: paramDescription,
    name: paramName,
    codeInfoChildren: paramChildren,
  } = useSectionInfos((x) => {
    const codeInfoChildren = getDisplayedCodeInfoCol(sectionId, x).children;
    return {
      isSelected: x.codeInfo[paramInfoId].isSelected,
      description: x.codeInfo[paramInfoId].description,
      name: x.codeInfo[paramInfoId].name,
      codeInfoChildren: codeInfoChildren[paramInfoId] ?? [],
    };
  }, _.isEqual);

  const bg = paramIsSelected
    ? "transition-colors active:!bg-cyan-300 !bg-blue-700 [&_*]:!text-white"
    : "transition-colors";

  function onMouseDownSelect(e) {
    if (!ancestorIsSelected && useMisc.getState().isSelectingParams) {
      e.stopPropagation();
      toggleParamSelected(sectionId, paramInfoId);
    }
  }

  const { childlessRef, childlessNameRef, parentRef } = useColumnWidth(
    sectionId,
    paramChildren,
  );

  return paramChildren.length === 0 ? (
    <>
      <article
        id={`ParamContainer-${sectionId}-${paramInfoId}`} // used for project-level search results
        className={`section-args-nested-key-value section-key-value group/arg-group section-min-rows grid grid-cols-subgrid items-center justify-between rounded-sm px-[2px] hover:bg-setta-100/50 hover:dark:bg-setta-800/70 ${bg} ${border} `}
        {...getFloatingBoxHandlers(paramDescription, paramName)}
        onMouseDownCapture={onMouseDownSelect} // has to be on capture for selection to work
        ref={childlessRef}
      >
        {!isKwarg ? (
          <div className="section-key overflow-hidden" ref={childlessNameRef}>
            {children}
          </div>
        ) : (
          <>{children}</>
        )}
        <ParamInput
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          maybeErrorMessage={maybeErrorMessage}
        />
        <ResizeHandle showResizeHandle={true} onMouseDown={onResizeStart} />
        {!!maybeErrorMessage && (
          <ErrorSection maybeErrorMessage={maybeErrorMessage} />
        )}
      </article>
    </>
  ) : (
    <article
      className={`section-args-nested section-lg-value group/arg-group section-min-rows grid grid-cols-subgrid items-center justify-between gap-y-1 rounded-sm ${bg} ${border} [&>p]:section-key-value ${isTopLevelWithPad ? "[&>p]:!pb-0 [&>p]:!pt-2" : ""}`}
      {...getFloatingBoxHandlers(paramDescription, paramName)}
      onMouseDown={onMouseDownSelect}
      ref={parentRef}
    >
      {children}
      <div className="section-args-nested section-key-value relative grid gap-y-1">
        <div className="absolute bottom-0 h-[calc(100%_-_0.1rem)] w-[0.4rem] rounded-full bg-setta-200/20 dark:bg-setta-400/20" />
        <GetParamSwitch
          sectionId={sectionId}
          paramIds={paramChildren}
          requiredParamIdsToPaths={requiredParamIdsToPaths}
          ancestorIsSelected={ancestorIsSelected || paramIsSelected}
          onResizeStart={onResizeStart}
        />
      </div>
    </article>
  );
}

export const ParamContainer = React.memo(_ParamContainer);

function useColumnWidth(sectionId, paramChildren) {
  const childlessRef = useRef();
  const childlessNameRef = useRef();
  const parentRef = useRef();
  useEffect(() => {
    return useSectionColumnWidth.subscribe(
      (state) => state[sectionId],
      (columnWidth) => {
        if (childlessRef.current) {
          // Use a CSS calc() function to provide a fallback
          childlessRef.current.style.gridTemplateColumns = `minmax(min-content, ${columnWidth}px) [c3] 0.75rem [c4] 1fr [c5]`;
        }
        if (parentRef.current) {
          parentRef.current.style.gridTemplateColumns = `[c1] 0.75rem [c2] minmax(min-content, ${columnWidth}px) [c3] 0.75rem [c4] 1fr [c5]`;
        }
        if (childlessNameRef.current) {
          childlessNameRef.current.style.width = `${columnWidth}px`;
        }
      },
      { fireImmediately: true },
    );
  }, [paramChildren.length > 0]); // have to update the subscriber when parameter becomes a parent or child

  return { childlessRef, childlessNameRef, parentRef };
}

function ErrorSection({ maybeErrorMessage }) {
  return (
    <Accordion.Root
      className="section-key-value group/arg-group rounded-b-lg"
      type="single"
      // defaultValue="item-1"
      collapsible
      asChild
    >
      <AccordionItem value="item-1">
        <AccordionTrigger>{maybeErrorMessage}</AccordionTrigger>
        <AccordionContent>{maybeErrorMessage}</AccordionContent>
      </AccordionItem>
    </Accordion.Root>
  );
}

const AccordionItem = React.forwardRef(
  ({ children, ...props }, forwardedRef) => (
    <Accordion.Item
      className="focus-within:relative focus-within:z-10
        "
      {...props}
      ref={forwardedRef}
    >
      {children}
    </Accordion.Item>
  ),
);

const AccordionTrigger = React.forwardRef(
  ({ children, className, ...props }, forwardedRef) => (
    <Accordion.Header className="flex">
      <Accordion.Trigger
        className="group mt-1 flex h-6 flex-1 cursor-default items-center justify-between overflow-hidden bg-red-500 pl-[2px] pr-1 font-mono text-xs font-bold text-red-50 outline-none transition-all hover:cursor-pointer dark:bg-red-800"
        {...props}
        ref={forwardedRef}
      >
        <p className="w-[calc(100%-1rem)] truncate">{children}</p>

        <BiChevronUp className="ease-[cubic-bezier(0.87, 0, 0.13, 1)] transition-transform duration-300 group-data-[state=closed]:rotate-180" />
      </Accordion.Trigger>
    </Accordion.Header>
  ),
);

const AccordionContent = React.forwardRef(
  ({ children, className, ...props }, forwardedRef) => (
    <Accordion.Content
      className="nowheel nodrag relative -mb-1 overflow-hidden bg-white px-1 text-xs dark:bg-setta-950"
      {...props}
      ref={forwardedRef}
    >
      <aside className=" mt-1 h-full cursor-text select-text overflow-y-scroll pb-2 pt-[.15rem] font-mono dark:text-setta-100">
        {children}
      </aside>
      <IconButton
        twClasses="absolute right-1 bottom-1.5 h-3 w-3 cursor-pointer text-setta-400 dark:text-setta-200 hover:text-setta-600 dark:hover:text-white"
        bg="bg-transparent hover:bg-setta-100 dark:hover:bg-setta-600"
        icon={<HiOutlineDuplicate />}
        onClick={() => navigator.clipboard.writeText(children)}
      />
    </Accordion.Content>
  ),
);

// for AccordionContent animated version:
// className="nowheel nodrag relative -mx-2 h-36 overflow-hidden rounded-md bg-white text-xs data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown dark:bg-setta-950"
