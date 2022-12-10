import SectionConfigComp from "components/AppContainer/Main/UiEditorContainer/SidePanes/UiEditor/SectionConfig/SectionConfigComp";
import { useActiveSection } from "models/activeSection";
import { useUIEditor } from "models/uiEditor";
import { SET_FROM_SIDEPANE } from "utils/constants";

export function NestedObjectInputConfig({ origin, ...props }) {
  return origin === SET_FROM_SIDEPANE ? (
    <ButtonGoToSectionConfig {...props} />
  ) : (
    <SectionConfigComp {...props} />
  );
}

function ButtonGoToSectionConfig({ paramChildId }) {
  const setTabIndex = useUIEditor((x) => x.setTabIndex);
  const setActiveSection = useActiveSection((x) => x.setId);
  const setCameFromUIConfig = useUIEditor((x) => x.setCameFromUIConfig);

  const onClick = () => {
    if (paramChildId) {
      setActiveSection(paramChildId);
      setCameFromUIConfig(true);
      setTabIndex(0);
    }
  };
  return <button onClick={onClick}>Configure section</button>;
}
