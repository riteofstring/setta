import * as Accordion from "@radix-ui/react-accordion";
import { GetParamSwitch } from "components/Params/GetParamSwitch";
import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import _ from "lodash";
import React, { useState } from "react";
import { BiChevronUp } from "react-icons/bi";
import { HiOutlineDuplicate } from "react-icons/hi";
import { getInfoViewHandlers } from "state/actions/infoView";
import {
  useCodeInfo,
  useProjectSearch,
  useTypeErrors,
} from "state/definitions";
import { useGetSectionInfo } from "state/hooks/sections";
import { ParamInput } from "./ParamItems/ParamInput";
import { ParamOptionsButton } from "./ParamUIs/ParamOptionsButton";
import { PinButton } from "./ParamUIs/PinButton";

function _ParamContainer({
  sectionId,
  paramInfo,
  setDidUpdate,
  isKwarg,
  children,
  onClick,
  notifyParentOfMouseOver,
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
  const [inputIsActive, setInputIsActive] = useState(false);
  const [childIsMousedOver, setChildIsMousedOver] = useState(0);
  const showButtons = !inputIsActive && isMousedOver && childIsMousedOver === 0;

  return paramChildren.length === 0 ? (
    <>
      <article
        className={`section-w-full group/arg-group section-min-rows -mx-2 grid grid-cols-subgrid items-center justify-between rounded-lg px-2   ${bg} ${border}`}
        {...getInfoViewHandlers(paramInfo.description)}
        onMouseOver={() => {
          if (!isMousedOver) notifyParentOfMouseOver?.((x) => x + 1);
          setIsMousedOver(true);
        }}
        onMouseLeave={() => {
          if (isMousedOver) notifyParentOfMouseOver?.((x) => x - 1);
          setIsMousedOver(false);
        }}
      >
        {isKwarg && showButtons && (
          <IconButton
            onClick={onClick}
            icon={<i className="gg-close" />}
            bg="bg-transparent"
            color="text-setta-100 dark:text-setta-700 hover:text-setta-500 dark:hover:text-setta-200"
            twClasses={`arg-close-btn section-left-gutter cursor-pointer place-self-center z-20`}
            padding=""
            size="h-[.5rem] w-[.5rem]"
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
          setInputIsActive={setInputIsActive}
        />
        {showButtons && (
          <PinButton
            sectionId={sectionId}
            paramInfoId={paramInfo.id}
            variants="justify-self-end self-center section-key bg-setta-200/50 dark:bg-setta-800/75 text-setta-400 opacity-75 [&_>_*]:text-setta-400"
          />
        )}
        {showButtons && (
          <ParamOptionsButton
            variants="bg-setta-200/50 dark:bg-setta-800/75 text-setta-400 opacity-75 [&_>_*]:after:border-setta-400"
            paramInfoId={paramInfo.id}
          />
        )}
        {!!maybeErrorMessage && (
          <ErrorSection maybeErrorMessage={maybeErrorMessage} />
        )}
      </article>
    </>
  ) : (
    <article
      className={`section-w-full group/arg-group section-min-rows grid grid-cols-subgrid items-center justify-between gap-y-1 rounded-lg  ${bg} ${border}`}
      {...getInfoViewHandlers(paramInfo.description)}
      onMouseOver={() => {
        if (!isMousedOver) notifyParentOfMouseOver?.((x) => x + 1);
        setIsMousedOver(true);
      }}
      onMouseLeave={() => {
        if (isMousedOver) notifyParentOfMouseOver?.((x) => x - 1);
        setIsMousedOver(false);
        setChildIsMousedOver(0);
      }}
    >
      {isKwarg && showButtons && (
        <IconButton
          onClick={onClick}
          icon={<i className="gg-close" />}
          bg="bg-transparent"
          color="text-setta-100 dark:text-setta-700 hover:text-setta-500 dark:hover:text-setta-200"
          twClasses={`arg-close-btn section-left-gutter cursor-pointer self-start justify-self-center mt-[0.3rem] z-20`}
          padding=""
          size="h-[.5rem] w-[.5rem]"
          tabIndex="-1"
        />
      )}
      {children}
      <div className="section-args-nested section-key-value grid gap-y-1">
        <GetParamSwitch
          sectionId={sectionId}
          parentId={paramInfo.id}
          infos={paramChildren}
          setDidUpdate={setDidUpdate}
          notifyParentOfMouseOver={setChildIsMousedOver}
        />
      </div>
      {showButtons && (
        <PinButton
          sectionId={sectionId}
          paramInfoId={paramInfo.id}
          variants="justify-self-end self-center section-value mr-6 bg-setta-200/50 dark:bg-setta-800/75 text-setta-400 opacity-75 [&_>_*]:text-setta-400"
        />
      )}
      {showButtons && (
        <ParamOptionsButton
          variants="bg-setta-200/50 dark:bg-setta-800/75 text-setta-400 opacity-75 [&_>_*]:after:border-setta-400"
          paramInfoId={paramInfo.id}
        />
      )}
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
        className="group -mx-2 mt-1 flex h-6 flex-1 cursor-default items-center justify-between overflow-hidden rounded-lg bg-red-500 px-2 font-mono text-xs font-bold text-red-50 outline-none transition-all hover:cursor-pointer dark:bg-red-800"
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
      className="nowheel nodrag relative -mx-2 -mb-1 overflow-hidden rounded-md bg-white text-xs dark:bg-setta-950"
      {...props}
      ref={forwardedRef}
    >
      <aside className=" mt-1 h-full cursor-text select-text overflow-y-scroll px-2 py-2 font-mono dark:text-setta-100">
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
