import { Editable } from "components/Utils/Editable";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { useEditableProjectName } from "state/hooks/project";

const editing =
  "flex-1 box-border border-solid border-transparent bg-transparent [border-width:0_0_2px_0] focus:outline-none focus-visible:border-blue-500";

const notEditing =
  "flex-1 box-border border-solid border-transparent bg-transparent [border-width:0_0_2px_0] w-full truncate";

export function ProjectName() {
  return (
    <header
      className="mb-2 flex w-full flex-col flex-wrap   tracking-tight "
      {...getFloatingBoxHandlers(
        "Your Project's Name and Config Name, editable all in one spot!",
      )}
    >
      <ProjectNameOnly />
    </header>
  );
}

function ProjectNameOnly() {
  const [localName, setLocalName, onBlur, onCancel] = useEditableProjectName();

  return (
    <Editable
      titleProps={{
        editing: `${editing} text-xl text-setta-900 dark:text-setta-50 font-bold `,
        notEditing: `${notEditing} text-xl text-setta-900 dark:text-setta-50 font-bold `,
      }}
      value={localName}
      onChange={setLocalName}
      onBlur={onBlur}
      onCancel={onCancel}
    />
  );
}
