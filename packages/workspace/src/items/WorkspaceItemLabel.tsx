import type { ComponentPropsWithoutRef, ReactNode } from "react";

// The registered item renderer owns label presentation, while the package owns placement in the
// row's named grid. Group labels must remain direct row children for the reference's spanning rule;
// leaf labels occupy the key track. Keeping that distinction here prevents consumers from relying
// on the package's private grid class names.
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
