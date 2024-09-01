import * as Accordion from "@radix-ui/react-accordion";
import { GetParamSwitch } from "components/Params/GetParamSwitch";
import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import _ from "lodash";
import React, { useState } from "react";
import { BiChevronUp } from "react-icons/bi";
import { HiOutlineDuplicate } from "react-icons/hi";
import { toggleCodeInfoSelected } from "state/actions/codeInfo";
import { getInfoViewHandlers } from "state/actions/infoView";
import {
  useCodeInfo,
  useProjectSearch,
  useTypeErrors,
} from "state/definitions";
import { useGetSectionInfo } from "state/hooks/sections";
import { ParamInput } from "./ParamItems/ParamInput";

function _ParamContainer({
  sectionId,
  paramInfo,
  setDidUpdate,
  isKwarg,
  children,
}) {
  const sectionIsFrozen = useGetSectionInfo(sectionId, "isFrozen");
  const maybeErrorMessage = useTypeErrors((x) => x[sectionId]?.[paramInfo.id]);
  const isFocusedSearchResult = useProjectSearch((x) =>
    _.isEqual(x.focused, { sectionId, paramInfoId: paramInfo.id }),
  );

  const isSearchResult = useProjectSearch((x) =>
    x.codeInfo.some((c) =>
      _.isEqual(c, { sectionId, paramInfoId: paramInfo.id }),
    ),
  );

  // warnings should be AMBER
  const border = maybeErrorMessage
    ? "bg-red-200 dark:bg-red-800/30"
    : isFocusedSearchResult
      ? "outline outline-4 outline-green-500 dark:outline-green-500/80"
      : isSearchResult
        ? "outline outline-4 outline-blue-500 dark:outline-cyan-300/80"
        : "";
  const canBeOverriden = sectionIsFrozen && !paramInfo.isFrozen;
  const paramIsSelected = paramInfo.isSelected;

  // hover:bg-setta-200/20 dark:hover:bg-setta-700/25
  // maybe use this for in bg hover state: div:hover:not(:has(div:hover))

  const bg = paramIsSelected ? "bg-lime-400/50" : "";

  const paramChildren = useCodeInfo(
    (x) => paramInfo.children.map((c) => x.x[c]),
    _.isEqual,
  );

  const [isMousedOver, setIsMousedOver] = useState(false);
  const [childIsMousedOver, setChildIsMousedOver] = useState(false);
  const showButtons = isMousedOver && !childIsMousedOver;

  return paramChildren.length === 0 ? (
    <>
      <article
        className={`section-w-full group/arg-group section-min-rows grid grid-cols-subgrid items-center justify-between ${bg} ${border}`}
        {...getInfoViewHandlers(paramInfo.description)}
        onMouseOver={() => {
          setIsMousedOver(true);
        }}
        onMouseLeave={() => {
          setIsMousedOver(false);
        }}
      >
        {showButtons && (
          <IconButton
            onClick={() => toggleCodeInfoSelected(paramInfo.id)}
            icon={<i className="gg-check" />}
            bg="dark:bg-setta-800 dark:hover:bg-blue-900 bg-setta-50 hover:bg-blue-400 border-white shadow-md dark:border-setta-700 hover:border-transparent  border-solid border-[1px]"
            color="[&_*]:hover:after:border-white [&_*]:after:border-setta-400 dark:[&_*]:after:border-setta-500 dark:[&_*]:hover:after:!border-setta-100"
            twClasses={`arg-close-btn section-right-gutter cursor-pointer place-self-center z-50 scale-125`}
            padding=""
            // size="h-1 w-1"
            tabIndex="-1"
          />
        )}
        {children}
        <ParamInput
          sectionId={sectionId}
          paramInfoId={paramInfo.id}
          defaultVal={paramInfo.defaultVal}
          isDisabled={!paramInfo.name}
          maybeErrorMessage={maybeErrorMessage}
          setDidUpdate={setDidUpdate}
        />
        {!!maybeErrorMessage && (
          <ErrorSection maybeErrorMessage={maybeErrorMessage} />
        )}
      </article>
    </>
  ) : (
    <article
      className={`section-w-full group/arg-group section-min-rows grid grid-cols-subgrid items-center justify-between gap-y-1 rounded-lg ${bg} ${border}`}
      {...getInfoViewHandlers(paramInfo.description)}
      onMouseOver={() => {
        setIsMousedOver(true);
      }}
      onMouseLeave={() => {
        setIsMousedOver(false);
        setChildIsMousedOver(false);
      }}
    >
      {showButtons && (
        <IconButton
          onClick={() => toggleCodeInfoSelected(paramInfo.id)}
          icon={<i className="gg-check" />}
          bg="dark:bg-setta-800 dark:hover:bg-blue-900 bg-setta-50 hover:bg-blue-400 border-white shadow-md dark:border-setta-700 hover:border-transparent border-solid border-[1px]"
          color="[&_*]:hover:after:border-white [&_*]:after:border-setta-400 dark:[&_*]:after:border-setta-500 dark:[&_*]:hover:after:!border-setta-100"
          twClasses={`arg-close-btn section-right-gutter cursor-pointer place-self-center z-50 scale-125`}
          padding=""
          // size="h-1 w-1"
          tabIndex="-1"
        />
      )}
      {children}
      <div
        className="section-args-nested section-key-right-gutter relative grid gap-y-1"
        onMouseOver={() => {
          setChildIsMousedOver(true);
        }}
        onMouseLeave={() => {
          setChildIsMousedOver(false);
        }}
      >
        <div className="absolute bottom-0 h-[calc(100%_-_0.25rem)] w-2 rounded-full bg-setta-200/20 dark:bg-setta-400/15" />
        <GetParamSwitch
          sectionId={sectionId}
          parentId={paramInfo.id}
          infos={paramChildren}
          setDidUpdate={setDidUpdate}
        />
      </div>
    </article>
  );
}

export const ParamContainer = React.memo(
  _ParamContainer,
  (p, n) =>
    p.sectionId === n.sectionId &&
    _.isEqual(p.paramInfo, n.paramInfo) &&
    _.isEqual(p.uiType, n.uiType),
);

function ErrorSection({ maybeErrorMessage }) {
  return (
    <Accordion.Root
      className="card-arg-group-error group/arg-group -mx-3 rounded-b-lg"
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
        className="group -mx-2 mt-1 flex h-6 flex-1 cursor-default items-center justify-between overflow-hidden bg-red-500 px-5 font-mono text-xs font-bold text-red-50 outline-none transition-all hover:cursor-pointer dark:bg-red-800"
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
      className="nowheel nodrag relative -mx-2 overflow-hidden bg-white text-xs dark:bg-setta-950"
      {...props}
      ref={forwardedRef}
    >
      <aside className=" my-1 h-full cursor-text select-text overflow-y-scroll px-5 py-3 font-mono dark:text-setta-100">
        {children}
      </aside>
      <IconButton
        twClasses="absolute right-2 bottom-2 h-3 w-3 cursor-pointer text-setta-400 dark:text-setta-200 hover:text-setta-600 dark:hover:text-white"
        bg="bg-setta-100/50 dark:bg-setta-700/50 hover:bg-setta-100 dark:hover:bg-setta-600"
        icon={<HiOutlineDuplicate />}
        onClick={() => navigator.clipboard.writeText(children)}
      />
    </Accordion.Content>
  ),
);

// for AccordionContent animated version:
// className="nowheel nodrag relative -mx-2 h-36 overflow-hidden rounded-md bg-white text-xs data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown dark:bg-setta-950"
