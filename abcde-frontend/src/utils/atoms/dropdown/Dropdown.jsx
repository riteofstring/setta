import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

export function Items(props) {
  return <DropdownMenu.Item className="">{props.children}</DropdownMenu.Item>;
}

export function Group(props) {
  return <DropdownMenu.Group className="">{props.children}</DropdownMenu.Group>;
}

export function Checkbox(props) {
  return (
    <DropdownMenu.CheckboxItem className="">
      {props.children}
    </DropdownMenu.CheckboxItem>
  );
}

export function ItemIndicator(props) {
  return (
    <DropdownMenu.ItemIndicator className="">
      {props.children}
    </DropdownMenu.ItemIndicator>
  );
}

export function RadioGroup(props) {
  return (
    <DropdownMenu.RadioGroup className="">
      {props.children}
    </DropdownMenu.RadioGroup>
  );
}

export function RadioItem(props) {
  return (
    <DropdownMenu.RadioItem className="">
      {props.children}
    </DropdownMenu.RadioItem>
  );
}

export function Sub(props) {
  return <DropdownMenu.Sub className="">{props.children}</DropdownMenu.Sub>;
}

export function Portal(props) {
  return (
    <DropdownMenu.Portal className="">{props.children}</DropdownMenu.Portal>
  );
}

export function SubContent(props) {
  return (
    <DropdownMenu.SubContent className="">
      {props.children}
    </DropdownMenu.SubContent>
  );
}

export function SubTrigger(props) {
  return (
    <DropdownMenu.SubTrigger className="">
      {props.children}
    </DropdownMenu.SubTrigger>
  );
}
