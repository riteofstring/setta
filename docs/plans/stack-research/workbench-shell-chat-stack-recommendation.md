# Workbench Shell And Chat Stack Recommendation

## Recommended Minimal Stack

Use **CSS grid/flex for the outer shell**, **shadcn `Resizable` / `react-resizable-panels` for the chat/workbench split**, **Radix/shadcn primitives for sidebars and the activity rail**, **a custom non-virtualized chat list first**, and **`react-textarea-autosize` for the composer**. Defer full virtualization, docking, rich text, and command-palette-style composer menus until the product proves it needs them.

This fits your constraints: local-first, backend-owned state, generated TS contracts, Tailwind/shadcn styling, and a workbench shell without adopting an IDE framework.

---

## 1. Resizable panes / workbench layout

### `react-resizable-panels` via shadcn `Resizable` — **use now**

* **Maintenance/activity:** Active. Search results show `react-resizable-panels` 4.x releases in 2026, including 4.9.0 in April and 4.11.0 in May. shadcn’s Resizable docs also note the move to `react-resizable-panels` v4. ([GitHub][1])
* **API shape and complexity:** Low-to-medium. The model is panel group → panel → resize handle/separator. For your shell, this is enough for `sidebar | workbench | chat` and nested vertical splits later. The v4 API changed names, so use the shadcn wrapper or pin compatible versions rather than hand-importing upstream primitives casually. ([GitHub][2])
* **Accessibility:** Stronger than most splitter libraries. shadcn describes the Resizable component as accessible and keyboard-supported. Still add visible focus states, accessible labels for handles, and test resize handles by keyboard. ([Shadcn][3])
* **Tailwind/shadcn compatibility:** Excellent. shadcn’s Resizable is explicitly built on top of `react-resizable-panels`, so it matches your current UI direction. ([Shadcn UI][4])
* **Electron compatibility:** Good. It is browser-renderer code. In a frameless Electron window, ensure resize handles, text inputs, and buttons live inside `app-region: no-drag` zones, because Electron’s docs say `app-region: no-drag` re-enables pointer events inside draggable regions. ([Electron][5])
* **Bundle/runtime cost:** Small enough for core shell use: Bundlephobia reports about **10.7 kB gzip** for `react-resizable-panels` v4.11.1. ([Bundlephobia][6])
* **Appropriate now or deferred:** **Use now** for the horizontally resizable chat panel and any basic split views.
* **Risks / reasons not to use:** It is not a docking framework. Do not force it to become VS Code-style drag/drop tabs. Also avoid its browser `localStorage` persistence patterns if the backend is source of truth; instead, listen to layout changes and persist through your Go-owned settings contract.

### `react-resizable-layout` — **keep as fallback, not first choice**

* **Maintenance/activity:** Appears maintained, with a 0.7.3 release noted in September 2025. ([npm][7])
* **API shape and complexity:** Headless hook/component approach. This gives more control but requires more shell code than shadcn Resizable. ([npm][7])
* **Accessibility:** Marketed as accessible/headless, but you would own more of the focus, hit-target, and labeling details. ([npm][7])
* **Tailwind/shadcn compatibility:** Good because it is headless, but there is no first-party shadcn wrapper.
* **Electron compatibility:** Good; same `app-region: no-drag` caution as above.
* **Bundle/runtime cost:** Likely small, but less ecosystem-standard for shadcn workbench layouts than `react-resizable-panels`.
* **Appropriate now or deferred:** **Do not use first.** Consider only if `react-resizable-panels` constraints become a problem.
* **Risks / reasons not to use:** Smaller ecosystem and more custom accessibility/styling responsibility.

### Considered but not recommended for this phase

`react-split-pane` is active again, but its API and layout constraints are less aligned with shadcn’s current Resizable path. The npm docs note it requires explicit parent dimensions, which is easy to get wrong in nested workbench shells. ([npm][8])

`Allotment` has a VS Code-like split-view heritage, but it requires importing its CSS and can fail invisibly when parent dimensions are not explicit. It is viable, but not as natural for a Tailwind/shadcn shell. ([GitHub][9])

---

## 2. Chat/message list rendering

### Custom `MessageList` first — **use now**

* **Maintenance/activity:** Owned by you; this is the safest starting point because the backend owns messages and the renderer only materializes the current conversation.
* **API shape and complexity:** Render a simple ordered message array from generated TS types: `MessageList -> MessageGroup -> MessageBubble/ToolCall/CodeBlock`. Keep stable message IDs from the backend, and treat streaming updates as updates to a specific message part, not as re-keyed array churn.
* **Accessibility:** Use a semantic region. MDN defines `role="log"` as a live region for ordered additions, and W3C’s ARIA technique specifically calls out chat messages being announced when added. Use `role="log"`, `aria-live="polite"`, avoid stealing focus during streaming, and provide a “Jump to latest” button when the user scrolls away from the bottom. ([MDN Web Docs][10])
* **Tailwind/shadcn compatibility:** Excellent. Message bubbles, tool-call cards, status chips, empty states, and skeletons can stay in your shadcn visual system.
* **Electron compatibility:** Excellent. Keep copy/select behavior native.
* **Bundle/runtime cost:** Zero dependency cost. The runtime risk is not bundle size; it is re-rendering too many Markdown/code/tool components during streaming.
* **Appropriate now or deferred:** **Use now.**
* **Risks / reasons not to use:** Once conversations become very long, the DOM can grow large. Start with profiling instead of adding virtualization preemptively.

### `@tanstack/react-virtual` — **defer, preferred virtualization choice when needed**

* **Maintenance/activity:** Active. Search results show `@tanstack/react-virtual` 3.13.x releases in 2026, and the official docs now include a dedicated Chat guide. ([NPMX][11])
* **API shape and complexity:** Hook-level and headless: `useVirtualizer({ count, getScrollElement, estimateSize, getItemKey, anchorTo: 'end', followOnAppend, overscan })`. This is more code than a component library, but it gives full control over markup and shadcn styling. ([TanStack][12])
* **Accessibility:** Virtualization removes offscreen DOM, so it can make screen-reader review, browser find, and “copy whole transcript” harder. TanStack’s chat guide emphasizes stable keys, dynamic measurement, end anchoring, and following appended output only when pinned; those are exactly the hard parts for chat. ([TanStack][12])
* **Tailwind/shadcn compatibility:** Excellent because it is headless and ships no markup/styles. ([GitHub][13])
* **Electron compatibility:** Good. It is DOM/scroll-container logic.
* **Bundle/runtime cost:** Low. Bundlephobia reports about **4.9 kB gzip** for `@tanstack/react-virtual` 3.13.13; TanStack describes the library as lightweight with dynamic/measured sizing support. ([Bundlephobia][14])
* **Appropriate now or deferred:** **Defer** until you have long histories, expensive message bodies, or measurable scroll/render jank.
* **Risks / reasons not to use:** More implementation responsibility. Add it only after your non-virtualized list has stable message IDs, pagination, pinned-bottom detection, and streaming behavior.

### `react-virtuoso` — **defer, easier but less minimal**

* **Maintenance/activity:** Active and widely used. Search results show `react-virtuoso` 4.18.7 published in May 2026, and Snyk classifies it as a key ecosystem project with millions of weekly downloads. ([npm][15])
* **API shape and complexity:** Component-level API, generally easier than TanStack Virtual. The core library supports variable-sized items without manual measurements; the Virtuoso site also offers chat/message-list-specific components. ([GitHub][16])
* **Accessibility:** Same virtualization caveats as TanStack. Easier scroll handling does not remove the need to test keyboard, screen reader, copy, and find behavior.
* **Tailwind/shadcn compatibility:** Good. Virtuoso says you can customize markup and use your own UI library. ([GitHub][16])
* **Electron compatibility:** Good.
* **Bundle/runtime cost:** Medium. Bundlephobia reports about **18.6 kB gzip** for `react-virtuoso` 4.18.7. ([Bundlephobia][17])
* **Appropriate now or deferred:** **Defer.** Use it if you want a more batteries-included virtual list.
* **Risks / reasons not to use:** The dedicated Virtuoso Message List package is commercial, and the base library is heavier than TanStack Virtual. ([Virtuoso][18])

### `react-markdown` — **use only if assistant output is Markdown**

* **Maintenance/activity:** Mature and widely adopted. Snyk reports `react-markdown` as a key ecosystem project with very high weekly downloads, and GitHub release search results show activity in 2025. ([Vulnerability Guide][19])
* **API shape and complexity:** Component API: pass a Markdown string and override elements through `components`. This is convenient for chat responses, links, lists, tables, and code blocks. ([GitHub][20])
* **Accessibility:** Good if you map Markdown to semantic HTML and style it carefully. Avoid raw HTML unless sanitized.
* **Tailwind/shadcn compatibility:** Good via `components` overrides, so code blocks, links, callouts, and tables can render as your components. ([Contentful][21])
* **Electron compatibility:** Good.
* **Bundle/runtime cost:** Medium. Bundlephobia reports about **33.3 kB gzip** for `react-markdown` 10.1.0. ([Bundlephobia][22])
* **Appropriate now or deferred:** **Use now only if your Project Chat output is Markdown.** Otherwise, render backend-typed message parts directly.
* **Risks / reasons not to use:** Raw HTML and syntax-highlighting plugins can introduce security and size issues. A 2026 issue in another project illustrates the risk of using `rehype-raw` without sanitization, and `react-syntax-highlighter` is very large at about **508 kB gzip**. ([GitHub][23])

For code highlighting, start with plain `<pre><code>` and lazy-load Shiki later if needed. Shiki’s own docs warn that highlighter creation is expensive, recommend caching the highlighter instance, and recommend fine-grained bundles instead of full bundles for browser use. ([Shiki][24])

---

## 3. Chat composer/input patterns

### Native form + `react-textarea-autosize` — **use now**

* **Maintenance/activity:** Mature. The package describes itself as a drop-in textarea replacement and search results show the latest 8.5.9 release in March 2025; its security policy says the latest version is supported. ([NPMX][25])
* **API shape and complexity:** Very low. Use `<TextareaAutosize minRows={1} maxRows={8} />` inside a native `<form>`.
* **Accessibility:** Strong because it remains a real textarea. Provide a visible or screen-reader label, preserve browser text selection, and handle IME composition so Enter does not send while the user is composing text.
* **Tailwind/shadcn compatibility:** Excellent. It accepts normal textarea props/classes and can be wrapped in your shadcn-style composer container. ([GitHub][26])
* **Electron compatibility:** Excellent. Ensure the composer is in a `no-drag` region for frameless windows. ([Electron][5])
* **Bundle/runtime cost:** Very low; the project README reports about **1.3 kB minified + gzip**. ([GitHub][26])
* **Appropriate now or deferred:** **Use now.**
* **Risks / reasons not to use:** Autosizing can create layout jumps if the composer grows without a max height. Set `maxRows`, keep the message list flexed above it, and test zoom levels.

Recommended composer behavior for a developer tool: **Enter sends**, **Shift+Enter inserts newline**, **Cmd/Ctrl+Enter also sends if you want multiline-friendly behavior**, **Esc closes suggestion popovers**, and **Stop/Cancel** appears while a backend run is active.

### `cmdk` via shadcn `Command`/Radix Popover — **defer until slash commands or context pickers**

* **Maintenance/activity:** Mature but slower cadence. npm/GitHub search results show `cmdk` 1.1.1 released in March 2025, and shadcn’s Command component uses `cmdk`. ([npm][27])
* **API shape and complexity:** Medium. Command palette primitives such as `Command`, `Command.Input`, `Command.List`, and `Command.Item` are good for `/commands`, `@file`, `#symbol`, or project-context pickers. ([GitHub][28])
* **Accessibility:** Good starting point because `cmdk` is described as usable as an accessible combobox, but test focus trapping, escape behavior, and screen reader announcements in your composer context. ([GitHub][28])
* **Tailwind/shadcn compatibility:** Excellent; shadcn already wraps it.
* **Electron compatibility:** Good. Popovers/portals work in the renderer.
* **Bundle/runtime cost:** Moderate for something optional: Bundlephobia reports about **14.6 kB gzip** for `cmdk` 1.1.1. ([Bundlephobia][29])
* **Appropriate now or deferred:** **Defer** unless slash commands/context insertion are in the immediate scope.
* **Risks / reasons not to use:** It can become a second interaction system inside the composer. Start with plain text; add `cmdk` when you have a concrete command/context model from the backend.

### Rich text editors / mention libraries — **avoid now**

Avoid TipTap, Slate, Lexical, Monaco-as-input, or full rich-text editors for the first Project Chat composer. Your use case needs fast text entry, multiline editing, context insertion, and command submission—not document editing.

`react-mentions` is useful for Facebook/Twitter-style textarea mentions, but the main package’s release search result is from 2023; use it only if you truly need inline mention markup serialization inside the textarea. ([GitHub][30])

---

## 4. Dockable/collapsible sidebars and activity rails

### Radix/shadcn primitives: `Collapsible`, `Toolbar`, `ToggleGroup`, `Tooltip` — **use now**

* **Maintenance/activity:** Mature and aligned with shadcn. Radix describes its primitives as accessible, unstyled, customizable, typed, and incrementally adoptable; search results show current Collapsible and Toggle Group package pages in the 1.1.x line. ([Radix UI][31])
* **API shape and complexity:** Low. `Collapsible.Root/Trigger/Content` fits hideable project sections. A vertical `Toolbar` or `ToggleGroup` fits the right activity rail for Canvas, Browser, Git, and Settings. ([Radix UI][32])
* **Accessibility:** Strong. Radix emphasizes WAI-ARIA patterns, focus management, and keyboard navigation; Toggle Group specifically supports full keyboard navigation and horizontal/vertical orientation. ([Radix UI][31])
* **Tailwind/shadcn compatibility:** Excellent. This is already the shadcn model.
* **Electron compatibility:** Excellent. Again, mark interactive rail/sidebar areas `no-drag` in frameless windows. ([Electron][5])
* **Bundle/runtime cost:** Low. Bundlephobia reports about **3.2 kB gzip** for Radix Collapsible and about **4.7 kB gzip** for Radix Toolbar; Toggle Group appears in the same small primitive family. ([Bundlephobia][33])
* **Appropriate now or deferred:** **Use now.**
* **Risks / reasons not to use:** Do not over-model the activity rail as a dock system. Treat it as a controlled mode selector: `activeActivity = "canvas" | "browser" | "git" | "settings" | null`.

### `dockview-react` — **defer until true user-dockable panels are required**

* **Maintenance/activity:** Very active. Search results show `dockview-react` 6.6.1 published very recently, and Dockview positions itself as a zero-dependency docking layout manager for React with tabs, groups, grids, splitviews, drag/drop, floating panels, and popout windows. ([npm][34])
* **API shape and complexity:** High. This is a layout manager with panels, groups, drag/drop, events, layout state, and theming—not just a sidebar primitive. ([Dockview][35])
* **Accessibility:** Requires careful audit. Drag/drop docking libraries often satisfy mouse-heavy workflows first; do not assume keyboard-equivalent docking behavior without testing.
* **Tailwind/shadcn compatibility:** Possible, but you will be adapting Dockview’s theming and layout concepts to your design system.
* **Electron compatibility:** Good for in-renderer docking. Popout/floating windows may collide with Electron window-management decisions, so defer that until you intentionally design multi-window behavior.
* **Bundle/runtime cost:** High relative to your current need. Bundlephobia reports **65.1 kB gzip** for `dockview-core` 6.5.0. ([Bundlephobia][36])
* **Appropriate now or deferred:** **Defer.**
* **Risks / reasons not to use:** It pulls you toward IDE-like layout state before you have core Project Chat behavior. Use only when users must rearrange/dock tool panels themselves.

### `FlexLayout` / docking layout managers — **avoid now**

`FlexLayout` is a real React docking manager for complex tabsets, but that is exactly why it is too much for this phase. Bundlephobia reports about **32.5 kB gzip** for `flexlayout-react`, and the project is aimed at moving/resizing complex tabsets rather than your current fixed workbench shell. ([GitHub][37])

---

## When virtualization is worth adding

Do **not** virtualize the first chat foundation by default. Add it when profiling or product behavior proves one of these is true:

1. Loaded conversations commonly exceed several hundred messages with Markdown/code/tool cards.
2. Streaming causes visible scroll or render jank.
3. You support older-history prepending/infinite scroll.
4. You need to keep many project chats mounted at once.
5. Memory/DOM node count becomes measurable in Electron devtools.

When you do add it, prefer **`@tanstack/react-virtual`** if your team is comfortable owning scroll behavior and markup. Its Chat guide now directly addresses bottom anchoring, prepends, streaming growth, stable keys, and “follow only when pinned” behavior. ([TanStack][12])

Avoid `react-window` and `react-virtualized` for this chat path unless you have a simple fixed-height list. Historic `react-window` issues show dynamic-height chat/message-list use cases are awkward, and `react-virtualized` is larger at about **27.2 kB gzip**. ([GitHub][38])

---

## Suggested implementation order

1. **Backend contracts first:** define layout preferences, chat session list, paged messages, streaming message events, cancellation, retry, and stable IDs. Persist layout/chat state through Go, not browser storage.
2. **Workbench shell:** CSS grid/flex outer frame; `react-resizable-panels` only where users resize real panes. Start with project sidebar, central workbench, chat panel, and right activity rail.
3. **Sidebar and rail:** build with Radix/shadcn primitives. Make the project area a normal list/nav with Project Chat history; make the rail a vertical controlled mode selector.
4. **Chat message model:** render typed message parts directly. Add `react-markdown` only if the backend/assistant actually emits Markdown strings.
5. **Composer:** native form + `react-textarea-autosize`; implement Enter/Shift+Enter, stop/cancel, disabled/loading states, and IME-safe submit handling.
6. **Scroll behavior:** pinned-bottom detection, “Jump to latest,” no focus stealing, `role="log"`/`aria-live="polite"`.
7. **Profiling gate:** add render timing and message-count thresholds. Introduce `@tanstack/react-virtual` only after the simple list shows real cost.
8. **Deferred enhancements:** `cmdk` for slash commands/context pickers, Shiki for lazy code highlighting, and Dockview only if users need true dockable/rearrangeable panels.

The practical next-phase dependency set is therefore:

```txt
Already aligned:
- shadcn/Radix primitives
- Zustand for in-memory renderer state
- generated TS backend contracts

Add now:
- react-resizable-panels through shadcn Resizable
- react-textarea-autosize

Optional now:
- react-markdown, only if messages are Markdown

Defer:
- @tanstack/react-virtual
- cmdk
- Shiki
- dockview-react
```

[1]: https://github.com/bvaughn/react-resizable-panels/releases?utm_source=chatgpt.com "Releases · bvaughn/react-resizable-panels"
[2]: https://github.com/bvaughn/react-resizable-panels?utm_source=chatgpt.com "bvaughn/react-resizable-panels"
[3]: https://v3.shadcn.com/docs/components/resizable?utm_source=chatgpt.com "Resizable - shadcn/ui"
[4]: https://ui.shadcn.com/docs/components/radix/resizable?utm_source=chatgpt.com "Resizable - shadcn/ui"
[5]: https://electronjs.org/docs/latest/tutorial/custom-window-interactions?utm_source=chatgpt.com "Custom Window Interactions"
[6]: https://bundlephobia.com/package/react-resizable-panels?utm_source=chatgpt.com "react-resizable-panels - Bundle Size"
[7]: https://www.npmjs.com/package/react-resizable-layout?utm_source=chatgpt.com "react-resizable-layout"
[8]: https://npmjs.com/package/react-split-pane?utm_source=chatgpt.com "React Split Pane v3"
[9]: https://github.com/johnwalley/allotment?utm_source=chatgpt.com "johnwalley/allotment: A React component for resizable split views"
[10]: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/log_role?utm_source=chatgpt.com "ARIA: log role - MDN Web Docs - Mozilla"
[11]: https://npmx.dev/package/%40tanstack/react-virtual/versions?utm_source=chatgpt.com "tanstack/react-virtual"
[12]: https://tanstack.com/virtual/latest/docs/chat "Chat | TanStack Virtual Docs"
[13]: https://github.com/TanStack/virtual "GitHub - TanStack/virtual:  Headless UI for Virtualizing Large Element Lists in JS/TS, React, Solid, Vue and Svelte · GitHub"
[14]: https://bundlephobia.com/package/%40tanstack/react-virtual%403.13.13?utm_source=chatgpt.com "@tanstack/react-virtual v3.13.13 ❘ Bundlephobia"
[15]: https://www.npmjs.com/package/react-virtuoso?activeTab=dependents&utm_source=chatgpt.com "react-virtuoso"
[16]: https://github.com/petyosi/react-virtuoso "GitHub - petyosi/react-virtuoso: The most powerful virtual list component for React · GitHub"
[17]: https://bundlephobia.com/package/react-virtuoso?utm_source=chatgpt.com "react-virtuoso v4.18.7 ❘ Bundlephobia"
[18]: https://virtuoso.dev/message-list/ "Virtuoso Message List | Virtuoso"
[19]: https://security.snyk.io/package/npm/react-markdown?utm_source=chatgpt.com "react-markdown"
[20]: https://github.com/remarkjs/react-markdown?utm_source=chatgpt.com "remarkjs/react-markdown: Markdown component for React"
[21]: https://www.contentful.com/blog/react-markdown/?utm_source=chatgpt.com "How to render and edit Markdown in React with ..."
[22]: https://bundlephobia.com/package/react-markdown?utm_source=chatgpt.com "react-markdown v10.1.0 ❘ Bundlephobia"
[23]: https://github.com/CopilotKit/CopilotKit/issues/3938?utm_source=chatgpt.com "Security: Markdown component renders raw HTML without ..."
[24]: https://shiki.style/guide/best-performance?utm_source=chatgpt.com "Best Performance Practices | Shiki"
[25]: https://npmx.dev/package/react-textarea-autosize/v/%5E8.5.9?utm_source=chatgpt.com "react-textarea-autosize"
[26]: https://github.com/Andarist/react-textarea-autosize?utm_source=chatgpt.com "Andarist/react-textarea-autosize"
[27]: https://www.npmjs.com/package/cmdk?utm_source=chatgpt.com "cmdk"
[28]: https://github.com/dip/cmdk?utm_source=chatgpt.com "dip/cmdk: Fast, unstyled command menu React component."
[29]: https://bundlephobia.com/package/cmdk?utm_source=chatgpt.com "cmdk v1.1.1 ❘ Bundlephobia"
[30]: https://github.com/signavio/react-mentions?utm_source=chatgpt.com "signavio/react-mentions: @mention people in a textarea"
[31]: https://www.radix-ui.com/primitives/docs?utm_source=chatgpt.com "Introduction – Radix Primitives"
[32]: https://www.radix-ui.com/primitives/docs/components/collapsible?utm_source=chatgpt.com "Collapsible – Radix Primitives"
[33]: https://bundlephobia.com/package/%40radix-ui/react-collapsible?utm_source=chatgpt.com "@radix-ui/react-collapsible v1.1.12 ❘ Bundlephobia"
[34]: https://www.npmjs.com/package/dockview-react?utm_source=chatgpt.com "dockview-react"
[35]: https://dockview.dev/docs/other/paneview/overview/?utm_source=chatgpt.com "Overview"
[36]: https://bundlephobia.com/package/dockview-core?utm_source=chatgpt.com "dockview-core v6.5.0 ❘ Bundlephobia"
[37]: https://github.com/caplin/FlexLayout?utm_source=chatgpt.com "caplin/FlexLayout: Docking Layout Manager for React"
[38]: https://github.com/bvaughn/react-window/issues/190?utm_source=chatgpt.com "VariableSizeList dynamic item height · Issue #190"
