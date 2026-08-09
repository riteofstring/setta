# UI Style Consistency Reference

## Purpose

Use this as the canonical reference map for UI styling. It lists specific components to mirror so new panes and refreshed panes stay consistent.

## Scope + Exclusions

This guide is for UI work across the app. Do not use the following panes as visual references:

- Watch Mode pane
- Custom Runs pane
- Notifications pane (especially the Logs sub-tab)
- Project AI settings aux view

## Principles

- Prioritize whitespace and clear text hierarchy over extra borders.
- Use minimal dividers only when they add clarity; avoid "boxed-in" layouts.
- Keep HTML semantic (header/nav/section/ul/li/etc.) and avoid div/tag soup.

## Icon Guidance

- Canvas section UI should default to css.gg icons (use `gg-*` classes) unless the user explicitly requests otherwise.
- One-off icons that appear in only a few places can use `react-icons`.

## Inspiration Map

Use these components as the primary style anchors:

- Small buttons (compact, text-xs, subtle hover):
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx` (top row: New/History/Thinking/Settings)
- File menu + dropdowns:
  - `frontend/src/components/AppHeader/FileMenu.tsx`
  - `frontend/src/components/Utils/atoms/menubar/menudropdown.tsx`
  - `frontend/src/components/Utils/atoms/menubar/menudropdownitem.tsx`
- Callable section filter/search field styling:
  - `frontend/src/components/Section/SectionParts/Search.tsx` (SectionSearch + TextInputCodeMirror styles)
- Icon buttons inside canvas sections:
  - `frontend/src/components/Section/Header/MenuButton/MenuButton.tsx`
  - `frontend/src/components/Section/Header/MinimizeButton.tsx`
  - `frontend/src/components/Section/Header/LockPositionButton.tsx`
  - `frontend/src/components/Section/Header/RunButton.tsx`
  - `frontend/src/components/Section/Header/DeleteOrHideButton.tsx`
- Canvas section icons (css.gg usage):
  - `frontend/src/components/Section/Header/HeaderIcon.tsx`
- Pane headings (small, uppercase, tracking-tight):
  - `frontend/src/components/Panes/Overview/Overview.tsx` (h2)
  - `frontend/src/components/Panes/UiEditor/UiEditor.tsx` (h2)
  - `frontend/src/components/Panes/Overview/RunInstructions.tsx` (h3/h4)
- View mode tab chrome (bottom bar + tab states):
  - `frontend/src/components/Pages/Project/ViewModeTabs.tsx`
- Section Config color controls (compact panel cards, reset/category controls):
  - `frontend/src/components/Panes/UiEditor/SectionConfig/SectionTagColorSettings.tsx`
  - `frontend/src/components/Panes/UiEditor/SectionConfig/SectionStyleColorSettings.tsx`
- List hover states:
  - `frontend/src/components/Panes/UiEditor/SectionVariants/VariantList.tsx` (version list item hover)
