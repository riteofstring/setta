import * as Accordion from "@radix-ui/react-accordion";
import * as Dialog from "@radix-ui/react-dialog";
import * as RadioGroup from "@radix-ui/react-radio-group";
import _ from "lodash";
import { Button } from "../../utils/atoms/buttons/Button";
import { ProjectListing } from "./ProjectListing";

export function FileExplorer({ files, selected, setSelected, modalType }) {
  function onChange(v) {
    if (v) {
      setSelected(JSON.parse(v));
    }
  }

  return (
    <>
      <Dialog.Title className="font-bold uppercase tracking-widest text-gray-400 mb-4 mx-3">
        {modalType === "Load" && "Load Project"}
        {modalType === "Save As" && "Save Project As"}
      </Dialog.Title>

      <div className="flex justify-between mb-2 mx-3 border-b pb-2 border-solid border-gray-200">
        <Button twClasses="text-xs text-gray-400 hover:text-gray-900 rounded-md ring-0">
          Name
        </Button>
        <Button twClasses="text-xs text-gray-400 hover:text-gray-900 rounded-md ring-0">
          Last Modified
        </Button>
      </div>

      <RadioGroup.Root
        value={JSON.stringify(selected)}
        onValueChange={onChange}
        asChild
      >
        <Accordion.Root
          type="multiple"
          className="overflow-y-scroll flex flex-col max-h-[25rem] h-[30vh] p-1"
        >
          {_.map(files, (x, idx) => (
            <ProjectListing
              project={x}
              key={`File ${idx}`}
              onClick={onChange}
            />
          ))}
        </Accordion.Root>
      </RadioGroup.Root>
    </>
  );
}
