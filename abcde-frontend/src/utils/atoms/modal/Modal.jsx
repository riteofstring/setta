import * as Dialog from "@radix-ui/react-dialog";

export function Root(props) {
  return <Dialog.Root className="">{props.children}</Dialog.Root>;
}

export function Trigger(props) {
  return <Dialog.Trigger className="">{props.children}</Dialog.Trigger>;
}

export function Portal(props) {
  return <Dialog.Portal className="">{props.children}</Dialog.Portal>;
}

export function Overlay(props) {
  return <Dialog.Overlay className="">{props.children}</Dialog.Overlay>;
}

export function Content(props) {
  return <Dialog.Content className="">{props.children}</Dialog.Content>;
}

export function Title(props) {
  return <Dialog.Title className="">{props.children}</Dialog.Title>;
}

export function Description(props) {
  return <Dialog.Description className="">{props.children}</Dialog.Description>;
}

export function Close(props) {
  return <Dialog.Close className="">{props.children}</Dialog.Close>;
}
