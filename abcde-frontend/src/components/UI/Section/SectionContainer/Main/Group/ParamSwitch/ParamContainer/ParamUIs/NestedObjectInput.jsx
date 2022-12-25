import { useActiveSection } from "models/activeSection";
import { SECTION_CONFIG_TAB, useUIEditor } from "models/uiEditor";

export function NestedObjectInputConfig(props) {
  return <ButtonGoToSectionConfig {...props} />;
}

function ButtonGoToSectionConfig({ paramChildId }) {
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
  return <button onClick={onClick}>Configure section</button>;
}
