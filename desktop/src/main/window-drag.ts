import type { IpcMain, IpcMainInvokeEvent } from "electron";

import { handleIpc, type IpcObserver } from "@shared/ipc";
import type { AppWindowDragPoint } from "@shared/types";

interface DraggableWindow {
  getPosition(): number[];
  isDestroyed(): boolean;
  setPosition(x: number, y: number): void;
}

interface WindowDragSession {
  pointerStart: AppWindowDragPoint;
  window: DraggableWindow;
  windowStart: AppWindowDragPoint;
}

export class AppWindowDragController {
  private readonly sessions = new Map<number, WindowDragSession>();

  constructor(
    private readonly windowFromEvent: (event: IpcMainInvokeEvent) => DraggableWindow | null,
  ) {}

  start(event: IpcMainInvokeEvent, point: AppWindowDragPoint): void {
    const window = this.requireWindow(event);
    this.sessions.set(event.sender.id, {
      pointerStart: validWindowDragPoint(point),
      window,
      windowStart: validWindowPosition(window.getPosition()),
    });
  }

  move(event: IpcMainInvokeEvent, point: AppWindowDragPoint): void {
    const session = this.sessions.get(event.sender.id);
    if (!session || session.window.isDestroyed()) {
      return;
    }
    const current = validWindowDragPoint(point);
    session.window.setPosition(
      Math.round(session.windowStart.screenX + current.screenX - session.pointerStart.screenX),
      Math.round(session.windowStart.screenY + current.screenY - session.pointerStart.screenY),
    );
  }

  end(event: IpcMainInvokeEvent): void {
    this.sessions.delete(event.sender.id);
  }

  private requireWindow(event: IpcMainInvokeEvent): DraggableWindow {
    const window = this.windowFromEvent(event);
    if (!window || window.isDestroyed()) {
      throw new Error("window drag request has no active BrowserWindow");
    }
    return window;
  }
}

interface AppWindowDragIpcRegistration {
  ipcMain: Pick<IpcMain, "handle">;
  ipcObserver?: IpcObserver;
  windowFromEvent: (event: IpcMainInvokeEvent) => DraggableWindow | null;
}

export function registerAppWindowDragIpcHandlers({
  ipcMain,
  ipcObserver,
  windowFromEvent,
}: AppWindowDragIpcRegistration): void {
  const appWindowDrag = new AppWindowDragController(windowFromEvent);
  handleIpc(
    ipcMain,
    "appWindowDragStart",
    (event, point) => {
      appWindowDrag.start(event, point);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "appWindowDragMove",
    (event, point) => {
      appWindowDrag.move(event, point);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "appWindowDragEnd",
    (event) => {
      appWindowDrag.end(event);
    },
    ipcObserver,
  );
}

function validWindowDragPoint(point: AppWindowDragPoint): AppWindowDragPoint {
  if (!Number.isFinite(point.screenX) || !Number.isFinite(point.screenY)) {
    throw new Error("window drag point must contain finite screen coordinates");
  }
  return point;
}

function validWindowPosition(position: number[]): AppWindowDragPoint {
  const [screenX, screenY] = position;
  if (screenX === undefined || screenY === undefined) {
    throw new Error("window position must contain x and y coordinates");
  }
  return validWindowDragPoint({ screenX, screenY });
}
