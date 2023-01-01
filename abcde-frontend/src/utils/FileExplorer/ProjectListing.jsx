import * as Accordion from "@radix-ui/react-accordion";
import * as RadioGroup from "@radix-ui/react-radio-group";
import React, { useRef } from "react";
import { HiCheckCircle, HiOutlineFolder } from "react-icons/hi";
import "./style.css";

export function ProjectListing({ name, project, onClick }) {
  return (
    <Accordion.Item value={name}>
      <AccordionTrigger name={name} />
      <ConfigListings project={project} onClick={onClick} />
    </Accordion.Item>
  );
}

const AccordionTrigger = React.forwardRef(({ name }, ref) => {
  return (
    <Accordion.Header>
      <Accordion.Trigger ref={ref} asChild>
        <div className="flex flex-grow items-center select-none gap-2 py-1 rounded-md px-2 cursor-pointer">
          <HiOutlineFolder className="text-gray-400 group-hover:text-gray-800" />
          <h4 className="text-xs font-bold text-gray-500 tracking-wider hover:text-gray-900">
            {name}
          </h4>
        </div>
      </Accordion.Trigger>
    </Accordion.Header>
  );
});

const ConfigListings = React.forwardRef(({ project, onClick }, ref) => {
  return (
    <Accordion.Content
      ref={ref}
      className="flex flex-col flex-grow data-[state='open']:animate-[slideDown_300ms_cubic-bezier(0.87,_0,_0.13,_1)] data-[state='closed']:animate-[slideUp_300ms_cubic-bezier(0.87,_0,_0.13,_1)]"
    >
      {project.configs.map((x, idx) => {
        const id = JSON.stringify({ id: project.id, configId: x.id });
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
      onClick(JSON.stringify({ id: null, configId: null }));
    }
  }

  return (
    <RadioGroup.Item
      value={id}
      ref={itemRef}
      onClick={_onClick}
      className="flex flex-grow text-sm cursor-pointer ml-6 rounded-lg items-center gap-2 py-1 hover:bg-gray-100 px-2 focus-visible:ring-1"
    >
      <span className="w-4">
        <RadioGroup.Indicator>
          <HiCheckCircle className="checkicon cursor-pointer text-green-500" />
        </RadioGroup.Indicator>
      </span>
      <div className="flex flex-grow justify-between">
        <label className="cursor-pointer">{name}</label>
        <div className="text-xs text-gray-500">2023/01/01</div>
      </div>
    </RadioGroup.Item>
  );
}
