import { Button } from "@chakra-ui/react";
import SectionConfigComp from "components/AppContainer/Main/UiEditorContainer/SidePanes/UiEditor/SectionConfig/SectionConfigComp";
import { useStoreActions } from "easy-peasy";
import { useActiveSection } from "models/activeSection";
import { SET_FROM_SIDEPANE } from "utils/constants";

export function NestedObjectInputConfig({ origin, ...props }) {
  return origin === SET_FROM_SIDEPANE ? (
    <ButtonGoToSectionConfig {...props} />
  ) : (
    <SectionConfigComp {...props} />
  );
}

function ButtonGoToSectionConfig({ paramChildId }) {
  const setTabIndex = useStoreActions((x) => x.uiEditor.setTabIndex);
  const setActiveSection = useActiveSection((x) => x.setId);
  const setCameFromUIConfig = useStoreActions(
    (x) => x.uiEditor.setCameFromUIConfig
  );

  const onClick = () => {
    if (paramChildId) {
      setActiveSection(paramChildId);
      setCameFromUIConfig(true);
      setTabIndex(0);
    }
  };
  return <Button onClick={onClick}>Configure section</Button>;
}
