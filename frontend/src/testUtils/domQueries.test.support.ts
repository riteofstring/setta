export function mustQueryHTMLElement(
  root: ParentNode,
  selector: string,
): HTMLElement {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Expected HTMLElement for selector ${selector}.`);
  }
  return element;
}

export function mustQueryHTMLCanvasElement(
  root: ParentNode,
  selector: string,
): HTMLCanvasElement {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLCanvasElement)) {
    throw new Error(`Expected HTMLCanvasElement for selector ${selector}.`);
  }
  return element;
}
