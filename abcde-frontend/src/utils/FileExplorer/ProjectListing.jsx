import * as Accordion from "@radix-ui/react-accordion";
import { BiFile } from "react-icons/bi";

export function ProjectListing({ name, project, onClick }) {
  return (
    <Accordion.Item>
      <Accordion.Header>
        <Accordion.Trigger>
          <div className="flex items-center select-none gap-2 py-1 rounded-md flex-grow px-2">
            <BiFile className="text-gray-400 group-hover:text-gray-800" />
            <h4 className="text-xs font-bold text-gray-500 tracking-wider">
              {name}
            </h4>
          </div>
        </Accordion.Trigger>
      </Accordion.Header>
      <ConfigListings project={project} onClick={onClick} />
    </Accordion.Item>
  );
}

function ConfigListings({ project, onClick }) {
  return project.configs.map((x, idx) => {
    const id = JSON.stringify({ id: project.id, configId: x.id });
    return (
      <Accordion.Content>
        <ConfigListing
          id={id}
          name={x.name}
          key={`File config ${idx} ${x}`}
          onClick={onClick}
        />
      </Accordion.Content>
    );
  });
}

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
      <label className="cursor-pointer">{name}</label>
    </RadioGroup.Item>
  );
}
