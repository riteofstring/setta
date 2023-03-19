import { useState } from "react";
import { BiSave } from "react-icons/bi";
import { IconButton } from "utils/atoms/buttons/IconButton";
import { DialogDropdownTriggerItem } from "utils/atoms/dialog/dialogTriggerItem";
import { StandardDropdown } from "utils/atoms/dropdown/dropdown";
import { SectionSaveModal } from "utils/FileExplorer/SectionSaveModal";

export function SaveButton({ sectionId }) {
  const [type, setType] = useState(null);

  return (
    <SectionSaveModal sectionId={sectionId} type={type}>
      <StandardDropdown
        trigger={<IconButton color="text-slate-400" icon={<BiSave />} />}
        content={
          <DialogDropdownTriggerItem
            onClick={() => setType("Custom Arguments")}
          >
            Save Custom Arguments
          </DialogDropdownTriggerItem>
        }
      ></StandardDropdown>
    </SectionSaveModal>
  );
}
