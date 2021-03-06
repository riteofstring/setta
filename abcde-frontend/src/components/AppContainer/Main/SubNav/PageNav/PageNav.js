import TemplateButton from "./TemplateButton/TemplateButton";
import UiEditButton from "./UiEditButton/UiEditButton";
import SaveButton from "./SaveButton/SaveButton";

export default function PageNav() {
  return (
    <>
      <SaveButton/>
      <UiEditButton />
      <TemplateButton />
    </>
  );
}
