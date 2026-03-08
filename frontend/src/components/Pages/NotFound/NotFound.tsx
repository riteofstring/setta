import { GrDocumentMissing } from "react-icons/gr";

type NotFoundProps = {
  title?: string;
  description?: string | null;
};

export function NotFound({
  title = "Project Not Found",
  description = null,
}: NotFoundProps) {
  return (
    <div className="single-cell-container absolute inset-x-0 bottom-0 top-12">
      <div className="single-cell-child my-auto flex flex-col items-center gap-6 text-setta-400 dark:text-setta-700">
        <GrDocumentMissing className="h-24 w-24" />
        <div className="flex max-w-2xl flex-col items-center gap-3 px-6 text-center">
          <h1 className="text-5xl font-black">{title}</h1>
          {description ? <p className="text-sm">{description}</p> : null}
        </div>
      </div>
    </div>
  );
}
