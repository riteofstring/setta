import type { BackendHealth } from "@generated/backend";

export interface RuntimeVersions {
  app: string;
  chrome: string;
  electron: string;
  node: string;
}

export interface BrowserPaneBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserPaneStatus {
  bounds: BrowserPaneBounds;
  focused: boolean;
  url: string;
}

export interface BrowserPaneSnapshot {
  documentHasFocus: boolean;
  rect: BrowserPaneBounds;
  selector: string;
  tagName: string;
  text: string;
  title: string;
  value: string | null;
}

export interface BrowserPaneScreenshot {
  height: number;
  pngBytes: number;
  width: number;
}

export interface BrowserPaneEvents {
  console: string[];
  network: string[];
}

export interface BrowserPanePoint {
  x: number;
  y: number;
}

export interface SettaAPI {
  app: {
    versions: () => Promise<RuntimeVersions>;
  };
  backend: {
    health: () => Promise<BackendHealth>;
  };
  browserPane: {
    captureScreenshot: () => Promise<BrowserPaneScreenshot>;
    click: (point: BrowserPanePoint) => Promise<void>;
    events: () => Promise<BrowserPaneEvents>;
    focus: () => Promise<void>;
    inspect: (selector: string) => Promise<BrowserPaneSnapshot | null>;
    loadPreview: () => Promise<BrowserPaneStatus>;
    setBounds: (bounds: BrowserPaneBounds) => Promise<BrowserPaneStatus>;
    status: () => Promise<BrowserPaneStatus>;
    typeText: (text: string) => Promise<void>;
  };
}
