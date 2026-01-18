### Recommendation for your constraints (fixed ~24px rows, tree expand/collapse, keyboard nav, 10k+ entries, minimal deps)

Use **`react-window` (v2)** unless you already know you need a fully headless primitive.

Reasoning:

* Your rows are **fixed-height**, so you get the simplest/fastest path in both libraries.
* `react-window` v2 is a **component** (`<List />`) with a straightforward “render row N” model and built-in imperative scrolling (**`scrollToRow`**) that fits keyboard navigation well. ([Tessl][1])
* v2 also brings **native TypeScript support**, **auto sizing** (no AutoSizer), and **memoization ergonomics**, which reduces integration code and “extra helper deps.” ([Yarn][2])
* It currently ships as v2.2.5 (recently published), so you’re not picking something stale. ([npm][3])

Choose **`@tanstack/react-virtual`** if you strongly prefer:

* “headless” rendering (you own all markup/layout),
* custom range extraction / sticky items / unusual containers,
* stable keys via `getItemKey` as a first-class option. ([Yarn][4])

---

## Tradeoffs: `react-window` vs `@tanstack/react-virtual`

### `react-window` (v2)

**Pros**

* Higher-level **List/Grid components**: fewer moving pieces for a fixed-height tree. ([Yarn][2])
* **Imperative scrolling** via `listRef.scrollToRow({ index, align, behavior })` is ideal for keyboard navigation. ([Tessl][5])
* v2 adds **TypeScript in-package**, **auto sizing**, **automatic memoization**, and **smaller bundle goals** compared to earlier patterns. ([Yarn][2])
* Has explicit notes around ARIA improvements and support hooks (`useListRef`). ([Yarn][2])

**Cons**

* Less “headless”: you work within its component model (still flexible, but not totally free-form).
* For trees, you’ll still flatten visible nodes; library doesn’t “do tree” for you.

### `@tanstack/react-virtual`

**Pros**

* **Headless**: maximum control over DOM/ARIA semantics and layout. ([Yarn][4])
* Clean primitive API (`useVirtualizer`, `getVirtualItems`, `getTotalSize`) and **`scrollToIndex`**. ([TanStack][6])
* First-class **stable keying** via `getItemKey`. ([TanStack][7])
* Small dependency footprint: depends on `@tanstack/virtual-core` and is ~16.84KB reported size-in-browser. ([Yarn][4])

**Cons**

* Slightly more integration code: you manually render the inner “spacer” element and absolutely-positioned rows (not hard, just more boilerplate). ([TanStack][6])

### “Something else”

* **Build it yourself** is viable for fixed-height rows (compute visible range from `scrollTop / rowHeight`), but you’ll end up reimplementing resize handling, overscan, scroll-to-index, and edge cases.
* Full-featured solutions (e.g. Virtuoso / full tree widgets) are usually heavier than your “minimal deps” constraint.

---

## Minimal tree virtualization example (recommended: `react-window` v2)

This pattern is what you want for a VSCode-like explorer:

1. Keep your tree data model.
2. Maintain `expanded` as a `Set`.
3. **Flatten** to a `rows[]` array of only visible nodes.
4. Virtualize that flat list.
5. Keyboard navigation moves an **active id**, then calls `scrollToRow`.

```tsx
import * as React from "react";
import { List, useListRef, type RowComponentProps } from "react-window";

type TreeNode = {
  id: string; // stable unique id (e.g. full path)
  name: string;
  kind: "file" | "dir";
  children?: TreeNode[];
};

type VisibleRow = {
  id: string;
  domId: string;
  name: string;
  kind: TreeNode["kind"];
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
};

const ROW_HEIGHT = 24;
const INDENT_PX = 12;

function toDomId(id: string) {
  // keep it simple; you can swap for a stronger encoding if needed
  return `treeitem-${id.replace(/[^\w-]/g, "_")}`;
}

function flattenTree(roots: TreeNode[], expanded: Set<string>): VisibleRow[] {
  const out: VisibleRow[] = [];

  const walk = (nodes: TreeNode[], depth: number) => {
    for (const node of nodes) {
      const hasChildren = node.kind === "dir" && (node.children?.length ?? 0) > 0;
      const isExpanded = hasChildren && expanded.has(node.id);

      out.push({
        id: node.id,
        domId: toDomId(node.id),
        name: node.name,
        kind: node.kind,
        depth,
        hasChildren,
        isExpanded,
      });

      if (isExpanded && node.children) walk(node.children, depth + 1);
    }
  };

  walk(roots, 0);
  return out;
}

function findParentIndex(rows: VisibleRow[], childIndex: number): number | null {
  const childDepth = rows[childIndex]?.depth ?? 0;
  for (let i = childIndex - 1; i >= 0; i--) {
    if (rows[i].depth === childDepth - 1) return i;
  }
  return null;
}

type ExplorerRowProps = {
  rows: VisibleRow[];
  activeId: string | null;
  setActiveId: (id: string) => void;
  toggleExpanded: (id: string) => void;
};

const Row = React.memo(function Row(
  props: RowComponentProps<ExplorerRowProps> & {
    // react-window v2 supports improved ARIA plumbing; keep optional to avoid TS friction
    ariaAttributes?: React.HTMLAttributes<HTMLElement>;
  }
) {
  const { index, style, rows, activeId, setActiveId, toggleExpanded } = props;
  const row = rows[index]!;
  const isActive = row.id === activeId;

  return (
    <div
      id={row.domId}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-expanded={row.hasChildren ? row.isExpanded : undefined}
      onMouseDown={() => setActiveId(row.id)}
      onDoubleClick={() => row.hasChildren && toggleExpanded(row.id)}
      style={{
        ...style, // must apply positioning/sizing from react-window :contentReference[oaicite:13]{index=13}
        display: "flex",
        alignItems: "center",
        paddingLeft: row.depth * INDENT_PX,
        userSelect: "none",
        background: isActive ? "rgba(0, 122, 204, 0.25)" : undefined,
      }}
    >
      <span
        style={{ width: 16, display: "inline-flex", justifyContent: "center" }}
        onMouseDown={(e) => {
          e.stopPropagation();
          if (row.hasChildren) toggleExpanded(row.id);
        }}
        aria-hidden
      >
        {row.hasChildren ? (row.isExpanded ? "▾" : "▸") : ""}
      </span>

      <span>{row.name}</span>
    </div>
  );
});

export function VirtualFileTree({ roots }: { roots: TreeNode[] }) {
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());

  const { rows, indexById } = React.useMemo(() => {
    const rows = flattenTree(roots, expanded);
    const indexById = new Map<string, number>();
    rows.forEach((r, i) => indexById.set(r.id, i));
    return { rows, indexById };
  }, [roots, expanded]);

  const [activeId, setActiveId] = React.useState<string | null>(null);

  // Keep activeId valid as the visible rows change (e.g. collapsing parents)
  React.useEffect(() => {
    if (rows.length === 0) {
      setActiveId(null);
      return;
    }
    if (activeId == null) {
      setActiveId(rows[0]!.id);
      return;
    }
    if (!indexById.has(activeId)) setActiveId(rows[0]!.id);
  }, [activeId, rows, indexById]);

  const activeIndex = activeId ? indexById.get(activeId) ?? 0 : 0;

  const toggleExpanded = React.useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const listRef = useListRef();

  // Keyboard nav wants “keep active row in view”
  React.useEffect(() => {
    if (rows.length === 0) return;

    listRef.current?.scrollToRow({
      index: activeIndex,
      align: "smart",
      behavior: "instant",
    });
  }, [activeIndex, rows.length, listRef]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (rows.length === 0) return;

    const clamp = (n: number) => Math.max(0, Math.min(rows.length - 1, n));
    const current = rows[activeIndex]!;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveId(rows[clamp(activeIndex + 1)]!.id);
        break;

      case "ArrowUp":
        e.preventDefault();
        setActiveId(rows[clamp(activeIndex - 1)]!.id);
        break;

      case "ArrowRight":
        if (!current.hasChildren) break;
        e.preventDefault();
        if (!current.isExpanded) toggleExpanded(current.id);
        else setActiveId(rows[clamp(activeIndex + 1)]!.id); // first child
        break;

      case "ArrowLeft":
        e.preventDefault();
        if (current.hasChildren && current.isExpanded) {
          toggleExpanded(current.id);
        } else {
          const parentIndex = findParentIndex(rows, activeIndex);
          if (parentIndex != null) setActiveId(rows[parentIndex]!.id);
        }
        break;

      case "Enter":
      case " ":
        if (current.hasChildren) {
          e.preventDefault();
          toggleExpanded(current.id);
        }
        break;
    }
  };

  const activeDomId = rows[activeIndex]?.domId;

  return (
    <div
      tabIndex={0}
      role="tree"
      aria-activedescendant={activeDomId}
      onKeyDown={onKeyDown}
      onMouseDown={(e) => (e.currentTarget as HTMLDivElement).focus()}
      style={{ height: "100%", width: "100%", outline: "none" }}
    >
      <List
        listRef={listRef}
        rowComponent={Row}
        rowCount={rows.length}
        rowHeight={ROW_HEIGHT}
        rowProps={{ rows, activeId, setActiveId, toggleExpanded }}
        overscanCount={8}
        style={{ height: "100%", width: "100%" }}
      />
    </div>
  );
}
```

Why this is “minimal” for your use case:

* Tree complexity stays in `flattenTree` and keyboard handling (which you need regardless).
* Virtualization is just `<List rowCount rowHeight rowComponent />` plus `scrollToRow`. ([Tessl][1])

`react-window` v2 notes: it expects React 18+ and may use `ResizeObserver` unless you provide explicit pixel sizing. ([Yarn][2])

---

## Same tree, but with `@tanstack/react-virtual` (when you want headless control)

Assume you already have `rows[]` and `activeIndex`.

```tsx
import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

const ROW_HEIGHT = 24;

function VirtualList({ rows }: { rows: { id: string; name: string }[] }) {
  const parentRef = React.useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    getItemKey: (i) => rows[i]!.id,
  });

  return (
    <div ref={parentRef} style={{ height: "100%", overflow: "auto" }}>
      <div
        style={{
          height: rowVirtualizer.getTotalSize(),
          position: "relative",
        }}
      >
        {rowVirtualizer.getVirtualItems().map((v) => {
          const row = rows[v.index]!;
          return (
            <div
              key={v.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: v.size,
                transform: `translateY(${v.start}px)`,
              }}
            >
              {row.name}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

Key APIs you’d use for keyboard navigation:

* `rowVirtualizer.scrollToIndex(activeIndex, { align: 'auto' | 'start' | 'center' | 'end' })` ([TanStack][7])
* Stable keys via `getItemKey` (recommended when your flattened rows shift a lot). ([TanStack][7])
* The fixed-size pattern (`count`, `estimateSize`, `getVirtualItems`, `getTotalSize`) matches the official example. ([TanStack][6])

---

## Bottom line

* If you want **least integration effort** + excellent fit for **fixed-height rows** + easy **scroll-to-active-row** for keyboard nav: **`react-window` v2**. ([Tessl][1])
* If you want **maximum markup/ARIA control** and don’t mind a bit more boilerplate: **`@tanstack/react-virtual`**. ([Yarn][4])

[1]: https://tessl.io/registry/tessl/npm-react-window/2.0.0/files/docs/list-virtualization.md "https://tessl.io/registry/tessl/npm-react-window/2.0.0/files/docs/list-virtualization.md"
[2]: https://classic.yarnpkg.com/en/package/react-window "https://classic.yarnpkg.com/en/package/react-window"
[3]: https://www.npmjs.com/package/react-window "https://www.npmjs.com/package/react-window"
[4]: https://classic.yarnpkg.com/en/package/%40tanstack/react-virtual "https://classic.yarnpkg.com/en/package/%40tanstack/react-virtual"
[5]: https://tessl.io/registry/tessl/npm-react-window/2.0.0/files/docs/imperative-apis.md "https://tessl.io/registry/tessl/npm-react-window/2.0.0/files/docs/imperative-apis.md"
[6]: https://tanstack.com/virtual/v3/docs/framework/react/examples/fixed "https://tanstack.com/virtual/v3/docs/framework/react/examples/fixed"
[7]: https://tanstack.com/virtual/latest/docs/api/virtualizer "https://tanstack.com/virtual/latest/docs/api/virtualizer"
