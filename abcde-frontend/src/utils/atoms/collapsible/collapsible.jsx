import * as Collapsible from "@radix-ui/react-collapsible";

export function StandardCollapsible({
  rootStyles,
  triggerStyles,
  contentStyles,
  trigger,
  open,
  heading,
  children,
}) {
  return (
    <Collapsible.Root className={rootStyles} open={open}>
      {heading}
      <Collapsible.Trigger className={triggerStyles} asChild>
        {trigger}
      </Collapsible.Trigger>
      <Collapsible.Content className={contentStyles}>
        {children}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
