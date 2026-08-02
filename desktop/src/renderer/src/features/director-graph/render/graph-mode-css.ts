/**
 * The graph's mode colours, as CSS.
 *
 * `graphModeColor` is the single source: it is what the shaders paint nodes and
 * edges with. Everything outside the canvas that means the same thing — a
 * failing artifact, a risk badge, an activity dot in the Now rail — has to say
 * it in the same colour, and the only way that holds is if it reads from here
 * rather than from a hand-matched copy.
 *
 * It was hand-matched before. The rail's approximations were out by as much as
 * 0.08 in lightness and 32 degrees of hue, which is what this replaces.
 */

import { graphModeColor, type GraphRgb } from "./graph-visual-language";

/** The custom property a mode is published under. */
export function graphModeCssVariable(mode: string): string {
  return `--graph-mode-${mode}`;
}

function cssColor([red, green, blue]: GraphRgb): string {
  const channel = (value: number): number => Math.round(Math.min(1, Math.max(0, value)) * 255);
  return `rgb(${channel(red)} ${channel(green)} ${channel(blue)})`;
}

export function graphModeCssVariables(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(graphModeColor).map(([mode, rgb]) => [
      graphModeCssVariable(mode),
      cssColor(rgb),
    ]),
  );
}

/**
 * Publishes the mode colours on a document root.
 *
 * Every page that renders Setta's surfaces calls this, including the galleries,
 * because an artifact drawn outside the command center still has to agree with
 * the canvas about what failure looks like.
 */
export function installGraphModeCssVariables(root: HTMLElement): void {
  for (const [name, value] of Object.entries(graphModeCssVariables())) {
    root.style.setProperty(name, value);
  }
}
