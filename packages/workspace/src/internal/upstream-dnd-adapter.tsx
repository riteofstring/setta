import { Accessibility, AutoScroller, DragDropManager } from "@dnd-kit/dom";
import { Rectangle, type BoundingRectangle } from "@dnd-kit/geometry";
import {
  DragDropProvider,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  type DragMoveEvent,
} from "@dnd-kit/react";
import { useCallback, useMemo, useRef, type ComponentProps, type ReactNode } from "react";

import type { InteractionPoint } from "./interaction-geometry.js";

export type AdapterDndInput = "keyboard" | "pointer" | "touch";

export type AdapterDndKeyboardDirection = "down" | "left" | "right" | "up";

export type AdapterDndEvent = {
  activatorPoint: InteractionPoint | null;
  clientPoint: InteractionPoint | null;
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
  manageAutoScroll?: boolean;
  overlayClassName?: string;
  overlayLabel?(sourceId: string): string;
  /**
   * Activation-time veto evaluated by the sensors before a gesture starts.
   * Return true to refuse activation, e.g. while another workspace
   * interaction system already owns the current gesture.
   */
  preventActivation?(): boolean;
  renderOverlay?(sourceId: string): ReactNode;
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
type AdapterPointerSource = Parameters<InstanceType<typeof PointerSensor>["bind"]>[0];

const KEYBOARD_DIRECTION_FACTOR: Readonly<Record<AdapterDndKeyboardDirection, InteractionPoint>> = {
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
};

let pendingKeyboardScrollRestore: (() => void) | null = null;

function normalizeKeyboardOffset(offset: InteractionPoint | number): InteractionPoint {
  return typeof offset === "number" ? { x: offset, y: offset } : offset;
}

function keyboardMoveDelta(
  direction: AdapterDndKeyboardDirection,
  offset: InteractionPoint,
  factor: number,
): InteractionPoint {
  const directionFactor = KEYBOARD_DIRECTION_FACTOR[direction];
  return {
    x: directionFactor.x * offset.x * factor,
    y: directionFactor.y * offset.y * factor,
  };
}

class CaptureEscapePointerSensor extends PointerSensor {
  #escapeController: AbortController | null = null;

  protected override handleStart(source: AdapterPointerSource, event: PointerEvent): void {
    this.#escapeController?.abort();
    const controller = new AbortController();
    this.#escapeController = controller;
    source.element?.ownerDocument.addEventListener("keydown", this.handleKeyDown, {
      capture: true,
      signal: controller.signal,
    });
    super.handleStart(source, event);
  }

  protected override handleKeyDown(event: KeyboardEvent): void {
    super.handleKeyDown(event);
    if (event.key === "Escape") {
      event.stopPropagation();
    }
  }

  protected override cleanup(): void {
    this.#escapeController?.abort();
    this.#escapeController = null;
    super.cleanup();
  }
}

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
  constructor(manager: AdapterKeyboardManager, options?: AdapterKeyboardOptions) {
    super(manager, { offset: 72, ...options });
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

class NoScrollKeyboardSensor extends ScrollStableKeyboardSensor {
  #sourceElement: Element | null = null;

  protected override handleStart(
    event: KeyboardEvent,
    source: AdapterKeyboardSource,
    options: AdapterKeyboardOptions,
  ): void {
    this.#sourceElement = source.element ?? null;
    super.handleStart(event, source, options);
  }

  protected override handleMove(
    direction: AdapterDndKeyboardDirection,
    event: KeyboardEvent,
  ): void {
    const offset = normalizeKeyboardOffset(this.options?.offset ?? KeyboardSensor.defaults.offset);
    const factor = event.shiftKey ? 5 : 1;
    const by = keyboardMoveDelta(direction, offset, factor);
    const restore = this.#sourceElement ? captureScrollRestore(this.#sourceElement) : null;
    event.preventDefault();
    this.manager.actions.move({ by, cancelable: false, event });
    restore?.();
  }

  protected override cleanup(): void {
    this.#sourceElement = null;
    super.cleanup();
  }
}

const adapterProofSensors = [CaptureEscapePointerSensor, ScrollStableKeyboardSensor];
function adapterPluginProps(
  manageAccessibility: boolean,
  manageAutoScroll: boolean,
): Pick<ComponentProps<typeof DragDropProvider>, "plugins"> {
  if (manageAccessibility && manageAutoScroll) return {};
  return {
    plugins: (defaults) =>
      defaults.filter((plugin) => {
        const pluginType = "plugin" in plugin ? plugin.plugin : plugin;
        return (
          (manageAccessibility || pluginType !== Accessibility) &&
          (manageAutoScroll || pluginType !== AutoScroller)
        );
      }),
  };
}

function createReactSafeManager(
  input: ConstructorParameters<typeof DragDropManager>[0],
): DragDropManager {
  const manager = new DragDropManager(input);
  const destroy = manager.destroy;
  let destroyScheduled = false;
  manager.destroy = () => {
    if (destroyScheduled) return;
    destroyScheduled = true;
    // dnd-kit destroys its manager from a React insertion-effect cleanup. An
    // active operation dispatches state updates from that restricted phase.
    // Let React finish the unmount first; normal gesture completion remains
    // synchronous, while teardown cleanup is deferred by one microtask.
    queueMicrotask(destroy);
  };
  return manager;
}

function stringId(id: string | number | undefined): string | null {
  return id === undefined ? null : String(id);
}

export function UpstreamDndBoundary({
  children,
  manageAccessibility = true,
  manageAutoScroll = true,
  overlayClassName = "setta-adapter-proof__drag-overlay",
  overlayLabel,
  preventActivation,
  renderOverlay,
  resolveCollisionRect,
  onMove,
  onStart,
  onPreviewTarget,
  onComplete,
}: UpstreamDndBoundaryProps) {
  const baseCollisionRect = useRef<BoundingRectangle | null>(null);
  const activeActivatorPoint = useRef<InteractionPoint | null>(null);
  const activeClientPoint = useRef<InteractionPoint | null>(null);
  const activeInput = useRef<AdapterDndInput>("pointer");
  const sensors = useMemo(() => {
    const keyboardSensor = manageAutoScroll ? ScrollStableKeyboardSensor : NoScrollKeyboardSensor;
    return preventActivation
      ? [
          { plugin: CaptureEscapePointerSensor, options: { preventActivation } },
          { plugin: keyboardSensor, options: { preventActivation } },
        ]
      : manageAutoScroll
        ? adapterProofSensors
        : [CaptureEscapePointerSensor, keyboardSensor];
  }, [manageAutoScroll, preventActivation]);
  const pluginProps = useMemo(
    () => adapterPluginProps(manageAccessibility, manageAutoScroll),
    [manageAccessibility, manageAutoScroll],
  );
  const managerRef = useRef<DragDropManager | null>(null);
  if (!managerRef.current) {
    managerRef.current = createReactSafeManager({ ...pluginProps, sensors });
  }
  const manager = managerRef.current;

  const syncCollisionRect = useCallback((manager: DragDropManager, transform: InteractionPoint) => {
    const base = baseCollisionRect.current;
    if (base) {
      manager.dragOperation.shape = Rectangle.from(base).translate(transform.x, transform.y);
    }
  }, []);

  return (
    <DragDropProvider
      {...pluginProps}
      manager={manager}
      sensors={sensors}
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
          activeClientPoint.current =
            adapterActivatorPoint(activatorEvent) ?? activeActivatorPoint.current;
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
              activeClientPoint.current,
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
        activeClientPoint.current = translatedClientPoint(activeActivatorPoint.current, transform);
        syncCollisionRect(manager, transform);
        onMove?.(
          adapterEvent(
            sourceId,
            operation.target?.id,
            activeInput.current,
            transform,
            activeActivatorPoint.current,
            activeClientPoint.current,
            event.nativeEvent,
          ),
        );
      }}
      onDragOver={({ operation }, manager) => {
        activeClientPoint.current = translatedClientPoint(
          activeActivatorPoint.current,
          operation.transform,
        );
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
              activeClientPoint.current,
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
        const completionClientPoint =
          adapterActivatorPoint(nativeEvent) ??
          activeClientPoint.current ??
          translatedClientPoint(activeActivatorPoint.current, operation.transform);
        const completion = {
          ...adapterEvent(
            sourceId,
            operation.target?.id,
            activeInput.current,
            operation.transform,
            activeActivatorPoint.current,
            completionClientPoint,
            nativeEvent,
          ),
          canceled,
        };
        onComplete(completion);
        baseCollisionRect.current = null;
        activeActivatorPoint.current = null;
        activeClientPoint.current = null;
      }}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {(source) => {
          const id = String(source.id);
          return (
            renderOverlay?.(id) ?? (
              <div aria-hidden="true" className={overlayClassName}>
                {overlayLabel?.(id) ?? `Moving ${id}`}
              </div>
            )
          );
        }}
      </DragOverlay>
    </DragDropProvider>
  );
}

export type UpstreamDndDraggableOptions = Readonly<{
  data?: Readonly<Record<string, unknown>>;
  disabled: boolean;
  id: string;
  /**
   * Reading isDragSource subscribes this component to a synchronous rerender
   * inside the drag-start input dispatch. Callers that derive their active
   * state from a deferred source opt out to keep activation off the render
   * hot path.
   */
  trackActive?: boolean;
}>;

export function useUpstreamDndDraggable({
  data,
  disabled,
  id,
  trackActive = true,
}: UpstreamDndDraggableOptions) {
  const draggable = useDraggable({ ...(data ? { data } : {}), disabled, id });
  return {
    active: trackActive ? draggable.isDragSource : false,
    elementRef: draggable.ref,
    handleRef: draggable.handleRef,
  };
}

export type UpstreamDndDroppableOptions = Readonly<{
  collisionPriority?: number;
  data?: Readonly<Record<string, unknown>>;
  disabled: boolean;
  id: string;
}>;

export function useUpstreamDndDroppable({
  collisionPriority,
  data,
  disabled,
  id,
}: UpstreamDndDroppableOptions) {
  const droppable = useDroppable({
    ...(collisionPriority === undefined ? {} : { collisionPriority }),
    ...(data ? { data } : {}),
    disabled,
    id,
  });
  return {
    active: droppable.isDropTarget,
    elementRef: droppable.ref,
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
  clientPoint: InteractionPoint | null,
  nativeEvent: Event | undefined,
): AdapterDndEvent {
  return {
    activatorPoint,
    clientPoint,
    keyboardDirection: adapterKeyboardDirection(nativeEvent),
    sourceId,
    targetId: stringId(targetId),
    input,
    transform: { x: transform.x, y: transform.y },
  };
}

function translatedClientPoint(
  activatorPoint: InteractionPoint | null,
  transform: InteractionPoint,
): InteractionPoint | null {
  return activatorPoint
    ? { x: activatorPoint.x + transform.x, y: activatorPoint.y + transform.y }
    : null;
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
