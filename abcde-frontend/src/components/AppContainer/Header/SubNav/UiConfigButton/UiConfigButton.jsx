import { BiCodeBlock } from "react-icons/bi";
import MenuBarButton from "utils/atoms/buttons/MenuBarButton";

export default function UiConfigButton() {
  // const { isOpen, onOpen, onClose } = useDisclosure();
  return (
    <>
      <MenuBarButton onClick={onOpen}>
        <BiCodeBlock />
        UI Config
      </MenuBarButton>
      {/* <UiEditorModal isOpen={isOpen} onClose={onClose} /> */}
    </>
  );
}
