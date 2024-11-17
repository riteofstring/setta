import { GrDocumentMissing } from "react-icons/gr";
export function NotFound() {
  return (
    <div className="my-auto flex flex-col items-center gap-6 text-setta-400 dark:text-setta-700">
      <GrDocumentMissing className="h-24 w-24" />
      <h1 className="text-5xl font-black ">Project Not Found</h1>
    </div>
  );
}
