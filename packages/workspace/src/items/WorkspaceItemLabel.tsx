import type { ComponentPropsWithoutRef, ReactNode } from "react";

export type WorkspaceItemLabelProps = Omit<
  ComponentPropsWithoutRef<"p">,
  "children"
> & {
  children: ReactNode;
  isGroup: boolean;
};

export function WorkspaceItemLabel({
  children,
  className,
  isGroup,
  ...paragraphProps
}: WorkspaceItemLabelProps) {
  const label = (
    <p {...paragraphProps} className={className}>
      {children}
    </p>
  );
  if (isGroup) {
    return label;
  }
  return <div className="section-key overflow-hidden">{label}</div>;
}
