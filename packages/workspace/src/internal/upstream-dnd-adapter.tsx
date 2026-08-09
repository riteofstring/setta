import { Rectangle, type BoundingRectangle } from "@dnd-kit/geometry";
import {
  DragDropProvider,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  type DragDropManager,
  type DragMoveEvent,
} from "@dnd-kit/react";
import { useCallback, useRef, type ComponentProps, type ReactNode } from "react";

import type { InteractionPoint } from "./interaction-geometry.js";

export type AdapterDndInput = "keyboard" | "pointer" | "touch";

export type AdapterDndKeyboardDirection = "down" | "left" | "right" | "up";

export type AdapterDndEvent = {
  activatorPoint: InteractionPoint | null;
  keyboardDirection: AdapterDndKeyboardDirection | null;
  sourceId: string;
  targetId: string | null;
  input: AdapterDndInput;
  transform: InteractionPoint;
};

export type AdapterDndCompletion = AdapterDndEvent & {
  canceled: boolean;
};

export type AdapterDndCollisionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type UpstreamDndBoundaryProps = {
  children: ReactNode;
  manageAccessibility?: boolean;
  overlayClassName?: string;
  overlayLabel?(sourceId: string): string;
  resolveCollisionRect?(
    sourceId: string,
    activatorPoint: InteractionPoint | null,
  ): AdapterDndCollisionRect | null;
  onMove?(event: AdapterDndEvent): void;
  onStart?(event: AdapterDndEvent): void;
  onPreviewTarget?(targetId: string | null): void;
  onComplete(completion: AdapterDndCompletion): void;
};

type AdapterKeyboardSource = Parameters<InstanceType<typeof KeyboardSensor>["bind"]>[0];
type AdapterKeyboardOptions = Parameters<InstanceType<typeof KeyboardSensor>["bind"]>[1];
type AdapterKeyboardManager = ConstructorParameters<typeof KeyboardSensor>[0];

let pendingKeyboardScrollRestore: (() => void) | null = null;

function captureScrollRestore(element: Element): () => void {
  const elementPositions: Array<Readonly<{ element: Element; left: number; top: number }>> = [];
  for (let current: Element | null = element; current; current = current.parentElement) {
    elementPositions.push({ element: current, left: current.scrollLeft, top: current.scrollTop });
  }
  const view = element.ownerDocument.defaultView;
  const windowPosition = view ? { left: view.scrollX, top: view.scrollY, view } : null;
  return () => {
    for (const position of elementPositions) {
      position.element.scrollLeft = position.left;
      position.element.scrollTop = position.top;
    }
    windowPosition?.view.scrollTo(windowPosition.left, windowPosition.top);
  };
}

function restorePendingKeyboardScroll(): void {
  pendingKeyboardScrollRestore?.();
  pendingKeyboardScrollRestore = null;
}

class ScrollStableKeyboardSensor extends KeyboardSensor {
  constructor(manager: AdapterKeyboardManager) {
    super(manager, { offset: 72 });
  }

  protected override handleStart(
    event: KeyboardEvent,
    source: AdapterKeyboardSource,
    options: AdapterKeyboardOptions,
  ): void {
    const element = source.element;
    pendingKeyboardScrollRestore = element ? captureScrollRestore(element) : null;
    try {
      super.handleStart(event, source, options);
    } finally {
      restorePendingKeyboardScroll();
    }
  }
}

const adapterProofSensors = [PointerSensor, ScrollStableKeyboardSensor];
const accessibilityPluginDisabled = {
  plugins: (defaults) =>
    defaults.filter(
      (plugin) => ("plugin" in plugin ? plugin.plugin : plugin).name !== "Accessibility",
    ),
} satisfies Pick<ComponentProps<typeof DragDropProvider>, "plugins">;

function accessibilityPluginProps(
  manageAccessibility: boolean,
): Pick<ComponentProps<typeof DragDropProvider>, "plugins"> {
  return manageAccessibility ? {} : accessibilityPluginDisabled;
}

function stringId(id: string | number | undefined): string | null {
  return id === undefined ? null : String(id);
}

export function UpstreamDndBoundary({
  children,
  manageAccessibility = true,
  overlayClassName = "setta-adapter-proof__drag-overlay",
  overlayLabel,
  resolveCollisionRect,
  onMove,
  onStart,
  onPreviewTarget,
  onComplete,
}: UpstreamDndBoundaryProps) {
  const baseCollisionRect = useRef<BoundingRectangle | null>(null);
  const activeActivatorPoint = useRef<InteractionPoint | null>(null);
  const activeInput = useRef<AdapterDndInput>("pointer");

  const syncCollisionRect = useCallback((manager: DragDropManager, transform: InteractionPoint) => {
    const base = baseCollisionRect.current;
    if (base) {
      manager.dragOperation.shape = Rectangle.from(base).translate(transform.x, transform.y);
    }
  }, []);

  return (
    <DragDropProvider
      {...accessibilityPluginProps(manageAccessibility)}
      sensors={adapterProofSensors}
      onDragStart={({ nativeEvent, operation }, manager) => {
        restorePendingKeyboardScroll();
        const sourceId = stringId(operation.source?.id);
        if (sourceId) {
          const activatorEvent = operation.activatorEvent ?? nativeEvent;
          activeInput.current = adapterInput(activatorEvent);
          activeActivatorPoint.current = adapterDragStartPoint(
            adapterActivatorPoint(activatorEvent),
            operation.transform,
          );
          const collisionRect = resolveCollisionRect?.(sourceId, activeActivatorPoint.current);
          baseCollisionRect.current = collisionRect ? boundingRect(collisionRect) : null;
          syncCollisionRect(manager, operation.transform);
          onStart?.(
            adapterEvent(
              sourceId,
              operation.target?.id,
              activeInput.current,
              operation.transform,
              activeActivatorPoint.current,
              activatorEvent,
            ),
          );
        }
      }}
      onDragMove={(event, manager) => {
        if (event.defaultPrevented) {
          return;
        }
        const { operation } = event;
        const sourceId = stringId(operation.source?.id);
        if (!sourceId) {
          return;
        }
        const transform = moveEventTransform(event);
        syncCollisionRect(manager, transform);
        onMove?.(
          adapterEvent(
            sourceId,
            operation.target?.id,
            activeInput.current,
            transform,
            activeActivatorPoint.current,
            event.nativeEvent,
          ),
        );
      }}
      onDragOver={({ operation }, manager) => {
        syncCollisionRect(manager, operation.transform);
        const targetId = stringId(operation.target?.id);
        onPreviewTarget?.(targetId);
        const sourceId = stringId(operation.source?.id);
        if (sourceId) {
          onMove?.(
            adapterEvent(
              sourceId,
              operation.target?.id,
              activeInput.current,
              operation.transform,
              activeActivatorPoint.current,
              undefined,
            ),
          );
        }
      }}
      onDragEnd={({ canceled, nativeEvent, operation }, manager) => {
        onPreviewTarget?.(null);
        const sourceId = stringId(operation.source?.id);
        if (!sourceId) {
          throw new Error("The completed dnd-kit operation has no source ID.");
        }
        syncCollisionRect(manager, operation.transform);
        const completion = {
          ...adapterEvent(
            sourceId,
            operation.target?.id,
            activeInput.current,
            operation.transform,
            activeActivatorPoint.current,
            nativeEvent,
          ),
          canceled,
        };
        onComplete(completion);
        baseCollisionRect.current = null;
        activeActivatorPoint.current = null;
      }}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {(source) => (
          <div aria-hidden="true" className={overlayClassName}>
            {overlayLabel?.(String(source.id)) ?? `Moving ${String(source.id)}`}
          </div>
        )}
      </DragOverlay>
    </DragDropProvider>
  );
}

export type UpstreamDndDraggableOptions = Readonly<{
  data?: Readonly<Record<string, unknown>>;
  disabled: boolean;
  id: string;
}>;

export function useUpstreamDndDraggable({ data, disabled, id }: UpstreamDndDraggableOptions) {
  const draggable = useDraggable({ ...(data ? { data } : {}), disabled, id });
  return {
    active: draggable.isDragSource,
    elementRef: draggable.ref,
    handleRef: draggable.handleRef,
  };
}

export type UpstreamDndItemProps = {
  children?: ReactNode;
  id: string;
  label: string;
  onElement?(element: HTMLElement | null): void;
  onSelect(additive: boolean): void;
  parentSectionId: string;
  rootSectionId: string;
  selected: boolean;
  wide?: boolean;
};

export function UpstreamDndItem({
  children,
  id,
  label,
  onElement,
  onSelect,
  parentSectionId,
  rootSectionId,
  selected,
  wide = false,
}: UpstreamDndItemProps) {
  const data = { sectionId: id, parentSectionId, rootSectionId };
  const draggable = useDraggable({ id, data });
  const droppable = useDroppable({
    id,
    data,
    disabled: selected,
    collisionPriority: 10,
  });
  const draggableRef = draggable.ref;
  const droppableRef = droppable.ref;
  const setElement = useCallback(
    (element: HTMLElement | null) => {
      draggableRef(element);
      droppableRef(element);
      onElement?.(element);
    },
    [draggableRef, droppableRef, onElement],
  );

  return (
    <article
      className="setta-adapter-proof__nested-section"
      data-drag-source={draggable.isDragSource ? "true" : "false"}
      data-drop-target={droppable.isDropTarget ? "true" : "false"}
      data-proof-section-id={id}
      data-selected={selected ? "true" : "false"}
      data-wide={wide ? "true" : "false"}
      ref={setElement}
    >
      <div className="setta-adapter-proof__nested-header">
        <button
          aria-pressed={selected}
          className="nodrag nowheel nopan setta-adapter-proof__nested-select"
          onClick={(event) => onSelect(event.shiftKey)}
          type="button"
        >
          {label}
        </button>
        <button
          aria-label={`Move ${label}`}
          className="nodrag nokey nowheel nopan setta-adapter-proof__nested-handle"
          ref={draggable.handleRef}
          type="button"
        >
          Move
        </button>
      </div>
      {children}
    </article>
  );
}

export type UpstreamDndDropZoneProps = {
  children: ReactNode;
  className: string;
  id: string;
  onElement?(element: HTMLElement | null): void;
};

export function UpstreamDndDropZone({
  children,
  className,
  id,
  onElement,
}: UpstreamDndDropZoneProps) {
  const droppable = useDroppable({
    id,
    data: { kind: "canvas" },
    collisionPriority: -10,
  });
  const droppableRef = droppable.ref;
  const setElement = useCallback(
    (element: HTMLElement | null) => {
      droppableRef(element);
      onElement?.(element);
    },
    [droppableRef, onElement],
  );

  return (
    <div
      className={className}
      data-drop-target={droppable.isDropTarget ? "true" : "false"}
      data-proof-canvas-target=""
      ref={setElement}
    >
      {children}
    </div>
  );
}

function adapterEvent(
  sourceId: string,
  targetId: string | number | undefined,
  input: AdapterDndInput,
  transform: InteractionPoint,
  activatorPoint: InteractionPoint | null,
  nativeEvent: Event | undefined,
): AdapterDndEvent {
  return {
    activatorPoint,
    keyboardDirection: adapterKeyboardDirection(nativeEvent),
    sourceId,
    targetId: stringId(targetId),
    input,
    transform: { x: transform.x, y: transform.y },
  };
}

function adapterKeyboardDirection(event: Event | undefined): AdapterDndKeyboardDirection | null {
  if (!(event instanceof KeyboardEvent)) {
    return null;
  }
  if (event.key === "ArrowDown") {
    return "down";
  }
  if (event.key === "ArrowLeft") {
    return "left";
  }
  if (event.key === "ArrowRight") {
    return "right";
  }
  return event.key === "ArrowUp" ? "up" : null;
}

function moveEventTransform({ by, operation, to }: DragMoveEvent): InteractionPoint {
  if (to) {
    return {
      x: operation.transform.x + to.x - operation.position.current.x,
      y: operation.transform.y + to.y - operation.position.current.y,
    };
  }
  if (by) {
    return {
      x: operation.transform.x + (by.x ?? 0),
      y: operation.transform.y + (by.y ?? 0),
    };
  }
  return operation.transform;
}

function adapterActivatorPoint(event: Event | null | undefined): InteractionPoint | null {
  if (event instanceof PointerEvent || event instanceof MouseEvent) {
    return { x: event.clientX, y: event.clientY };
  }
  return null;
}

function adapterDragStartPoint(
  currentPoint: InteractionPoint | null,
  transform: InteractionPoint,
): InteractionPoint | null {
  return currentPoint ? { x: currentPoint.x - transform.x, y: currentPoint.y - transform.y } : null;
}

function adapterInput(event: Event | null | undefined): AdapterDndInput {
  if (event instanceof KeyboardEvent) {
    return "keyboard";
  }
  if (event instanceof PointerEvent && event.pointerType === "touch") {
    return "touch";
  }
  return "pointer";
}

function boundingRect(rect: AdapterDndCollisionRect): BoundingRectangle {
  return {
    left: rect.x,
    top: rect.y,
    right: rect.x + rect.width,
    bottom: rect.y + rect.height,
    width: rect.width,
    height: rect.height,
  };
}
