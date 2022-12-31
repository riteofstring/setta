import { useActiveSection } from "models/activeSection";
import { SECTION_CONFIG_TAB, useUIEditor } from "models/uiEditor";
import { Button } from "utils/atoms/buttons/Button";

export function ButtonGoToSectionConfig({ paramChildId }) {
  const setTab = useUIEditor((x) => x.setTab);
  const setActiveSection = useActiveSection((x) => x.setId);
  const setCameFromUIConfig = useUIEditor((x) => x.setCameFromUIConfig);

  const onClick = () => {
    if (paramChildId) {
      setActiveSection(paramChildId);
      setCameFromUIConfig(true);
      setTab(SECTION_CONFIG_TAB);
    }
  };
  return (
    <Button
      twClasses="mt-2 text-xs text-gray-600 hover:bg-gray-200 hover:text-gray-900 py-1 px-2 rounded-md gap-1 select-none mr-2 self-start"
      onClick={onClick}
    >
      Configure Section
    </Button>
  );
}
