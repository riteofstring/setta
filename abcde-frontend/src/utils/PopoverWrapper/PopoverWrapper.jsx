import {
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverCloseButton,
  PopoverContent,
  PopoverFooter,
  PopoverHeader,
  PopoverTrigger,
} from "@chakra-ui/react";

export function PopoverWrapper({ trigger, body, header, closeButton, footer }) {
  return (
    <Popover>
      <PopoverTrigger>{trigger}</PopoverTrigger>
      <PopoverContent>
        <PopoverArrow />
        {closeButton && <PopoverCloseButton />}
        {header && <PopoverHeader>{header}</PopoverHeader>}
        <PopoverBody>{body}</PopoverBody>
        {footer && <PopoverFooter>{footer}</PopoverFooter>}
      </PopoverContent>
    </Popover>
  );
}
