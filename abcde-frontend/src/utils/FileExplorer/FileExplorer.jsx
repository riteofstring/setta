import * as Accordion from "@radix-ui/react-accordion";
import * as Dialog from "@radix-ui/react-dialog";
import * as RadioGroup from "@radix-ui/react-radio-group";
import _ from "lodash";
import { Button } from "../../utils/atoms/buttons/Button";
import { ProjectListing } from "./ProjectListing";

export default function FileExplorer({
  files,
  selected,
  setSelected,
  modalType,
}) {
  function onChange(v) {
    if (v) {
      setSelected(JSON.parse(v));
    }
  }

  return (
    <div className="items-stretch overflow-y-auto">
      <Dialog.Title className="font-bold uppercase tracking-widest text-gray-400 mb-4">
        {modalType === "Load" && "Load Project"}
        {modalType === "Save As" && "Save Project As"}
      </Dialog.Title>
      <div className="flex justify-between mb-2">
        <Button twClasses="text-xs text-gray-400 hover:text-gray-900 rounded-md">
          Name
        </Button>
        <Button twClasses="text-xs text-gray-400 hover:text-gray-900 rounded-md">
          Date
        </Button>
      </div>
      <RadioGroup.Root
        value={JSON.stringify(selected)}
        onValueChange={onChange}
        className="flex flex-col p-1 rounded-lg border border-solid border-gray-100 overflow-y-scroll"
      >
        <Accordion.Root type="multiple">
          {_.map(files, (x, idx) => (
            <ProjectListing
              project={x}
              name={x.name}
              key={`File ${idx}`}
              onClick={onChange}
            />
          ))}
        </Accordion.Root>
      </RadioGroup.Root>
    </div>
  );
}
