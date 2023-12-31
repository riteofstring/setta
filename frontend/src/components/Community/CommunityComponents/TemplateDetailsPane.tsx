import { DetailsContent } from "./DetailsContent";

export function TemplateDetailPane() {
  return (
    <div className=" flex w-full min-w-[1px] flex-col items-center overflow-auto py-8 px-12">
      <DetailsContent />
    </div>
  );
}
