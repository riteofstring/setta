import { atom } from "jotai";

export const vis = atom({ overview: true, uiEditor: false });
export const width = atom({ overview: 320, uiEditor: 500 });
export const trueWidth = atom({ overview: 320, uiEditor: 40 });
export const isDragging = atom({ overview: false, uiEditor: false });