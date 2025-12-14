import { getOwnerDocument } from "@dnd-kit/utilities";
import type { MouseEvent } from "react";

import {
  AbstractPointerSensor,
  AbstractPointerSensorOptions,
  PointerEventHandlers,
} from "../pointer";
import type { SensorProps } from "../types";

const events: PointerEventHandlers = {
  move: { name: "mousemove" },
  end: { name: "mouseup" },
};

enum MouseButton {
  RightClick = 2,
}

interface MouseSensorOptions extends AbstractPointerSensorOptions {}

type MouseSensorProps = SensorProps<MouseSensorOptions>;

class MouseSensor extends AbstractPointerSensor {
  constructor(props: MouseSensorProps) {
    super(props, events, getOwnerDocument(props.event.target));
  }

  static activators = [
    {
      eventName: "onMouseDown" as const,
      handler: (
        { nativeEvent: event }: MouseEvent,
        { onActivation }: MouseSensorOptions,
      ) => {
        if (event.button === MouseButton.RightClick) {
          return false;
        }

        onActivation?.({ event });

        return true;
      },
    },
  ];
}
