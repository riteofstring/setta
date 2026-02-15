import { type HTMLAttributes, type ReactNode } from "react";
import { type ProjectConfig } from "utils/generatedTypes";
import { ProjectConfigPreview } from "./ProjectConfigPreview";

export function ProjectConfigThumbnailSurface({
  previewImgColor,
  topLevelSections,
  className = "",
  overlay,
  previewContainerProps,
}: {
  previewImgColor: string;
  topLevelSections: ProjectConfig["topLevelSections"];
  className?: string;
  overlay?: ReactNode;
  previewContainerProps?: HTMLAttributes<HTMLDivElement>;
}) {
  const previewContainerClassName = [
    "col-start-1 col-end-2 row-start-1 row-end-2 -m-4 grid place-items-center overflow-hidden opacity-50 mix-blend-multiply [&>*]:scale-150",
    previewContainerProps?.className ?? "",
  ]
    .join(" ")
    .trim();

  return (
    <div
      className={`col-start-1 col-end-2 row-start-1 row-end-2 grid w-full bg-center p-4 ${previewImgColor} ${className}`}
    >
      {overlay}
      <div {...previewContainerProps} className={previewContainerClassName}>
        <ProjectConfigPreview topLevelSections={topLevelSections} />
      </div>
    </div>
  );
}
