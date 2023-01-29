import * as Accordion from "@radix-ui/react-accordion";
import * as RadioGroup from "@radix-ui/react-radio-group";
import React, { useRef } from "react";
import { HiCheckCircle, HiChevronDown, HiOutlineFolder } from "react-icons/hi";
import "./style.css";

export function ProjectListing({ project, onClick }) {
  return (
    <Accordion.Item value={project.name}>
      <AccordionTrigger name={project.name} />
      <ConfigListings project={project} onClick={onClick} />
    </Accordion.Item>
  );
}

const AccordionTrigger = React.forwardRef(({ name }, ref) => {
  return (
    <Accordion.Trigger ref={ref} asChild>
      <div className="flex flex-grow cursor-pointer select-none items-center gap-2 rounded-md py-1 px-2 ">
        <HiOutlineFolder className="text-gray-400 group-hover:text-gray-800" />

        <div className="flex flex-grow justify-between bg-white">
          <div className="flex gap-2">
            <h4 className="text-xs font-bold tracking-wider text-gray-500 hover:text-gray-900">
              {name}
            </h4>
            {/* { ? <HiChevronDown /> : <HiChevronUp />} */}
            <HiChevronDown />
          </div>

          <div className="text-xs text-gray-400">2023/01/01</div>
        </div>
      </div>
    </Accordion.Trigger>
  );
});

const ConfigListings = React.forwardRef(({ project, onClick }, ref) => {
  //
  return (
    <Accordion.Content
      ref={ref}
      className="flex flex-grow flex-col transition-transform data-[state='open']:animate-[slideDown_300ms_cubic-bezier(0.87,_0,_0.13,_1)] data-[state='closed']:animate-[slideUp_300ms_cubic-bezier(0.87,_0,_0.13,_1)]"
    >
      {project.configs.map((x, idx) => {
        const id = JSON.stringify({
          projectName: project.name,
          configName: x.name,
        });
        return (
          <ConfigListing
            id={id}
            name={x.name}
            onClick={onClick}
            key={`File config ${idx} ${x}`}
          />
        );
      })}
    </Accordion.Content>
  );
});

function ConfigListing({ id, name, onClick }) {
  const itemRef = useRef();

  function _onClick() {
    const isChecked =
      itemRef?.current?.attributes["data-state"]?.value === "checked";
    if (isChecked) {
      onClick(JSON.stringify({ projectName: null, configName: null }));
    }
  }

  return (
    <RadioGroup.Item
      value={id}
      ref={itemRef}
      onClick={_onClick}
      className="ml-6 flex flex-grow cursor-pointer items-center gap-2 rounded-lg py-1 px-2 text-sm hover:bg-gray-100 focus-visible:ring-1"
    >
      <span className="w-4">
        <RadioGroup.Indicator>
          <HiCheckCircle className="checkicon cursor-pointer text-green-500" />
        </RadioGroup.Indicator>
      </span>
      <div className="flex flex-grow justify-between">
        <label className="cursor-pointer">{name}</label>
        <div className="text-xs text-gray-400">2023/01/01</div>
      </div>
    </RadioGroup.Item>
  );
}
