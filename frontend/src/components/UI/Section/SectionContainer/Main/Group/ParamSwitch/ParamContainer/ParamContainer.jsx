import * as Accordion from "@radix-ui/react-accordion";
import _ from "lodash";
import { useCodeInfo } from "state/definitions/codeInfo";
import { useSetCurrInfoView } from "state/definitions/infoView";
import { useTypeErrors } from "state/definitions/typeErrors";
import { useProjectSearch } from "state/definitions/useProjectSearch";
import React from "react";
import { BiChevronUp } from "react-icons/bi";
import { HiOutlineDuplicate } from "react-icons/hi";
import { useGetSectionInfo } from "state/hooks/useGetSectionInfo";
import { IconButton } from "utils/atoms/buttons/IconButton";
import { GetParamSwitch } from "../GetParamSwitch";
import { ParamInput } from "./ParamItems/ParamInput";
import { ParamOptionsButton } from "./ParamUIs/ParamOptionsButton/ParamOptionsButton";
import { PinButton } from "./ParamUIs/PinButton/PinButton";

function _ParamContainer({ sectionId, paramInfo, isKwarg, children }) {
  const sectionIsFrozen = useGetSectionInfo(sectionId, "isFrozen");
  const infoViewHandlers = useSetCurrInfoView(paramInfo.description);
  const maybeErrorMessage = useTypeErrors((x) => x[sectionId]?.[paramInfo.id]);
  const isSearchResult = useProjectSearch((x) =>
    x.codeInfo.includes(paramInfo.id),
  );

  // warnings should be AMBER
  const border = maybeErrorMessage
    ? "bg-red-200 dark:bg-red-800/30"
    : isSearchResult
      ? "outline outline-green-400"
      : "";
  const canBeOverriden = sectionIsFrozen && !paramInfo.isFrozen;
  const paramIsSelected = paramInfo.isSelected;

  const bg = paramIsSelected
    ? "bg-lime-400/50"
    : "hover:bg-setta-200/20 dark:hover:bg-setta-700/25";

  const paramChildren = useCodeInfo(
    (x) => paramInfo.children.map((c) => x.x[c]),
    _.isEqual,
  );

  return paramChildren.length === 0 ? (
    <>
      <article
        className={`card-arg-group group/arg-group -mx-3 -my-1 items-center justify-between rounded-lg px-3 py-1 ${bg} ${border}`}
        {...infoViewHandlers}
      >
        {children}
        <ParamInput
          sectionId={sectionId}
          paramInfoId={paramInfo.id}
          defaultVal={paramInfo.defaultVal}
          isDisabled={!paramInfo.name}
          maybeErrorMessage={maybeErrorMessage}
        />
        <PinButton
          sectionId={sectionId}
          paramInfoId={paramInfo.id}
          variants="justify-self-end self-center"
        />
        <ParamOptionsButton />
        {!!maybeErrorMessage && (
          <ErrorSection maybeErrorMessage={maybeErrorMessage} />
        )}
      </article>
    </>
  ) : (
    <article
      className={`card-arg-group group/arg-group -mx-2 -my-1 items-center justify-between rounded-lg px-2 py-1  ${bg} ${border}`}
      {...infoViewHandlers}
    >
      {children}
      <div className="card-args-list-nested pb-1 pt-2 [&>article]:!gap-2">
        <GetParamSwitch
          sectionId={sectionId}
          parentId={paramInfo.id}
          infos={paramChildren}
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

        <BiChevronUp
          className="ease-[cubic-bezier(0.87, 0, 0.13, 1)] transition-transform duration-300 group-data-[state=closed]:rotate-180"
          aria-hidden
        />
      </Accordion.Trigger>
    </Accordion.Header>
  ),
);

const AccordionContent = React.forwardRef(
  ({ children, className, ...props }, forwardedRef) => (
    <Accordion.Content
      className="nowheel nodrag relative -mx-2 overflow-hidden rounded-md bg-white text-xs dark:bg-setta-950"
      {...props}
      ref={forwardedRef}
    >
      <aside className=" h-full cursor-text select-text overflow-y-scroll px-2 py-2 font-mono dark:text-setta-100">
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
