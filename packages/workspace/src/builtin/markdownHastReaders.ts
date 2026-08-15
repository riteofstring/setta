// Structural readers for the two Markdown tree nodes the rendered surface inspects. The package
// declares no `@types/hast` dependency, so the shapes ride these narrow structural types instead;
// they describe exactly the fields read and nothing else.

type MarkdownHastNode = {
  type?: unknown;
  tagName?: unknown;
  value?: unknown;
  properties?: unknown;
  children?: unknown;
};

export type MarkdownFencedCode = {
  code: string;
  className: string | undefined;
};

function asNode(candidate: unknown): MarkdownHastNode | null {
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }
  return candidate as MarkdownHastNode;
}

function readClassName(node: MarkdownHastNode): string | undefined {
  const properties = asNode(node.properties);
  if (!properties) {
    return undefined;
  }
  const className: unknown = (properties as { className?: unknown }).className;
  if (typeof className === "string") {
    return className;
  }
  if (Array.isArray(className)) {
    return className.filter((entry) => typeof entry === "string").join(" ");
  }
  return undefined;
}

function readText(node: MarkdownHastNode): string {
  if (typeof node.value === "string") {
    return node.value;
  }
  if (!Array.isArray(node.children)) {
    return "";
  }
  return node.children
    .map((child) => {
      const childNode = asNode(child);
      return childNode ? readText(childNode) : "";
    })
    .join("");
}

// The `pre` element Markdown produces always wraps exactly one `code` element, because the
// rendered surface never enables raw HTML. Anything else means the tree stopped matching the
// contract this renderer was written against, which is a failure rather than a shape to guess at.
export function readFencedCode(node: unknown): MarkdownFencedCode {
  const preNode = asNode(node);
  const children = Array.isArray(preNode?.children) ? preNode.children : [];
  const codeNode = children.length === 1 ? asNode(children[0]) : null;
  if (!codeNode || codeNode.tagName !== "code") {
    throw new Error("A Markdown code block did not carry the expected single code element.");
  }
  return {
    // Markdown always terminates a fenced block with a newline; the editor surface renders the
    // committed text, so drop the one the parser adds rather than painting a trailing blank line.
    code: readText(codeNode).replace(/\n$/u, ""),
    className: readClassName(codeNode),
  };
}
