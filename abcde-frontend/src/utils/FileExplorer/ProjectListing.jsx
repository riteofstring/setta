import * as RadioGroup from "@radix-ui/react-radio-group";
import { useRef } from "react";
import { HiCheckCircle, HiOutlineFolder } from "react-icons/hi";

export function ProjectListing({ project, onClick }) {
  return (
    <div value={project.name} className="flex flex-col">
      <Group name={project.name} />
      <ConfigListings project={project} onClick={onClick} />
    </div>
  );
}

function Group({ name }) {
  return (
    <div className="flex flex-grow select-none items-center gap-2 rounded-md py-1 px-2">
      <HiOutlineFolder className="text-gray-400 group-hover:text-gray-800" />

      <div className="flex flex-grow justify-between bg-white">
        <div className="flex gap-2">
          <h4 className="text-xs font-bold tracking-wider text-gray-500 hover:text-gray-900">
            {name}
          </h4>
        </div>

        {/* <div className="text-xs text-gray-400">2023/01/01</div> */}
      </div>
    </div>
  );
}

function ConfigListings({ project, onClick }) {
  //
  return (
    <div className="flex flex-grow flex-col ">
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
    </div>
  );
}

function ConfigListing({ id, name, onClick }) {
  const itemRef = useRef(null);

  function _onClick() {
    const isChecked =
      itemRef.current?.attributes["data-state"]?.value === "checked";
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
