import * as Accordion from "@radix-ui/react-accordion";
import { GetParamSwitch } from "components/Params/GetParamSwitch";
import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import _ from "lodash";
import React from "react";
import { BiChevronUp } from "react-icons/bi";
import { HiOutlineDuplicate } from "react-icons/hi";
import { toggleParamSelected } from "state/actions/kwargs/kwargs";
import {
  useCodeInfo,
  useParamShortcuts,
  useProjectSearch,
  useTypeErrors,
} from "state/definitions";
import { useCodeInfoChildren } from "state/hooks/codeInfoCols";
import { useGetSectionInfo } from "state/hooks/sections";
import { ParamInput } from "./ParamItems/ParamInput";

function _ParamContainer({
  sectionId,
  paramInfoId,
  requiredParamIdsToPaths,
  ancestorIsSelected,
  children,
}) {
  const sectionIsFrozen = useGetSectionInfo(sectionId, "isFrozen");
  const maybeErrorMessage = useTypeErrors(
    (x) => x.errors[sectionId]?.[paramInfoId],
  );
  const isFocusedSearchResult = useProjectSearch((x) =>
    _.isEqual(x.focused, { sectionId, paramInfoId }),
  );

  const isSearchResult = useProjectSearch((x) =>
    x.codeInfo.some((c) => _.isEqual(c, { sectionId, paramInfoId })),
  );

  // warnings should be AMBER
  const border = maybeErrorMessage
    ? "bg-red-200 dark:bg-red-800/30"
    : isFocusedSearchResult
      ? "outline outline-4 outline-green-500 dark:outline-green-500/80"
      : isSearchResult
        ? "outline outline-4 outline-blue-500 dark:outline-cyan-300/80"
        : "";
  const canBeOverriden = useCodeInfo(
    (x) => sectionIsFrozen && x.x[paramInfoId].isFrozen,
  );
  const {
    isSelected: paramIsSelected,
    description: paramDescription,
    name: paramName,
  } = useCodeInfo(
    (x) => _.pick(x.x[paramInfoId], ["isSelected", "description", "name"]),
    _.isEqual,
  );

  const paramChildren = useCodeInfoChildren(sectionId, paramInfoId);

  // hover:bg-setta-200/20 dark:hover:bg-setta-700/25
  // maybe use this for in bg hover state: div:hover:not(:has(div:hover))

  const bg = paramIsSelected ? "bg-setta-500/20" : "";

  function onClickSelect(e) {
    if (!ancestorIsSelected && useParamShortcuts.getState().isSelectingParams) {
      e.stopPropagation();
      toggleParamSelected(sectionId, paramInfoId);
    }
  }

  return paramChildren.length === 0 ? (
    <>
      <article
        className={`section-lg-value group/arg-group section-min-rows ml-2 grid grid-cols-subgrid items-center justify-between overflow-clip rounded-md ${bg} ${border}`}
        {...getFloatingBoxHandlers(paramDescription, paramName)}
        onMouseDownCapture={onClickSelect}
      >
        {children}
        <ParamInput
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          maybeErrorMessage={maybeErrorMessage}
        />
        {!!maybeErrorMessage && (
          <ErrorSection maybeErrorMessage={maybeErrorMessage} />
        )}
      </article>
    </>
  ) : (
    <article
      className={`section-lg-value group/arg-group section-min-rows ml-2 grid grid-cols-subgrid items-center justify-between gap-y-1 overflow-clip rounded-md ${bg} ${border}`}
      {...getFloatingBoxHandlers(paramDescription, paramName)}
      onMouseDownCapture={onClickSelect}
    >
      {children}
      <div className="section-args-nested section-key-value relative grid gap-y-1">
        <div className="absolute bottom-0 h-[calc(100%_-_0.25rem)] w-[0.4rem] rounded-full bg-setta-200/20 dark:bg-setta-400/20" />
        <GetParamSwitch
          sectionId={sectionId}
          paramIds={paramChildren}
          requiredParamIdsToPaths={requiredParamIdsToPaths}
          ancestorIsSelected={ancestorIsSelected || paramIsSelected}
        />
      </div>
    </article>
  );
}

export const ParamContainer = React.memo(_ParamContainer);

function ErrorSection({ maybeErrorMessage }) {
  return (
    <Accordion.Root
      className="card-arg-group-error group/arg-group rounded-b-lg "
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
        className="group -ml-3 mt-1 flex h-6 flex-1 cursor-default items-center justify-between overflow-hidden bg-red-500 pl-3 pr-2 font-mono text-xs font-bold text-red-50 outline-none transition-all hover:cursor-pointer dark:bg-red-800"
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
      className="nowheel nodrag relative -mx-3  -mb-1 overflow-hidden bg-white px-1 text-xs dark:bg-setta-950"
      {...props}
      ref={forwardedRef}
    >
      <aside className=" mt-1 h-full cursor-text select-text overflow-y-scroll px-2 pb-2 pt-[.15rem] font-mono dark:text-setta-100">
        {children}
      </aside>
      <IconButton
        twClasses="absolute right-4 bottom-2 h-3 w-3 cursor-pointer text-setta-400 dark:text-setta-200 hover:text-setta-600 dark:hover:text-white"
        bg="bg-transparent hover:bg-setta-100 dark:hover:bg-setta-600"
        icon={<HiOutlineDuplicate />}
        onClick={() => navigator.clipboard.writeText(children)}
      />
    </Accordion.Content>
  ),
);

// for AccordionContent animated version:
// className="nowheel nodrag relative -mx-2 h-36 overflow-hidden rounded-md bg-white text-xs data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown dark:bg-setta-950"
