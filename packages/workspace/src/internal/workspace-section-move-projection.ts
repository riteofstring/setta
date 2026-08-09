import type { InteractionPoint } from "./interaction-geometry.js";

const PREVIEW_ATTRIBUTE = "data-workspace-section-move-preview-transform";
const PREVIEW_X_PROPERTY = "--setta-workspace-section-move-preview-x";
const PREVIEW_Y_PROPERTY = "--setta-workspace-section-move-preview-y";

function clearPreview(element: HTMLElement): void {
  element.removeAttribute(PREVIEW_ATTRIBUTE);
  element.style.removeProperty(PREVIEW_X_PROPERTY);
  element.style.removeProperty(PREVIEW_Y_PROPERTY);
}

function applyPreview(element: HTMLElement, transform: InteractionPoint): void {
  element.setAttribute(PREVIEW_ATTRIBUTE, `${String(transform.x)},${String(transform.y)}`);
  element.style.setProperty(PREVIEW_X_PROPERTY, `${String(transform.x)}px`);
  element.style.setProperty(PREVIEW_Y_PROPERTY, `${String(transform.y)}px`);
}

export class WorkspaceSectionMoveProjection {
  readonly #elements = new Map<string, HTMLElement>();
  #transforms: Readonly<Record<string, InteractionPoint>> = {};

  register(sectionId: string, element: HTMLElement): void {
    const previous = this.#elements.get(sectionId);
    if (previous && previous !== element) {
      clearPreview(previous);
    }
    this.#elements.set(sectionId, element);
    const transform = Object.hasOwn(this.#transforms, sectionId)
      ? this.#transforms[sectionId]
      : undefined;
    if (transform) {
      applyPreview(element, transform);
    }
  }

  unregister(sectionId: string, element: HTMLElement): void {
    if (this.#elements.get(sectionId) !== element) {
      return;
    }
    clearPreview(element);
    this.#elements.delete(sectionId);
  }

  preview(transformsById: Readonly<Record<string, InteractionPoint>>): void {
    const affectedIds = new Set([...Object.keys(this.#transforms), ...Object.keys(transformsById)]);
    for (const sectionId of affectedIds) {
      const element = this.#elements.get(sectionId);
      if (!element) {
        continue;
      }
      const transform = Object.hasOwn(transformsById, sectionId)
        ? transformsById[sectionId]
        : undefined;
      if (transform) {
        applyPreview(element, transform);
      } else {
        clearPreview(element);
      }
    }
    this.#transforms = transformsById;
  }

  clear(): void {
    this.preview({});
  }
}
