import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  Workspace,
  type WorkspacePaneRegistration,
  type WorkspaceProps,
  type WorkspaceToolbarControl,
} from "../src/react.js";

function PaneIcon({ label }: Readonly<{ label: string }>) {
  return <span>{label}</span>;
}

function paneRegistrations(
  rendered: string[] = [],
  controllers: Set<unknown> = new Set(),
): readonly WorkspacePaneRegistration[] {
  return [
    {
      icon: <PaneIcon label="S" />,
      id: "sections",
      label: "Sections",
      placement: "start",
      render: (controller) => {
        controllers.add(controller);
        rendered.push("sections");
        return <p>Section navigator</p>;
      },
    },
    {
      icon: <PaneIcon label="D" />,
      id: "details",
      label: "Details",
      placement: "end",
      render: (controller) => {
        controllers.add(controller);
        rendered.push("details");
        return (
          <label>
            Details filter
            <input />
          </label>
        );
      },
    },
  ];
}

describe("workspace pane registration", () => {
  it("renders one controller-only pane with linked toolbar disclosure controls", () => {
    const rendered: string[] = [];
    const controllers = new Set<unknown>();
    const markup = renderToStaticMarkup(
      <Workspace
        ariaLabel="Pane workspace"
        defaultActivePaneId="sections"
        panes={paneRegistrations(rendered, controllers)}
      />,
    );

    expect(rendered).toEqual(["sections"]);
    expect(controllers.size).toBe(1);
    expect(markup).toContain('data-workspace-pane-open="true"');
    expect(markup).toContain('data-workspace-pane-placement="start"');
    expect(markup).toMatch(
      /aria-controls="([^"]+-pane-0)" aria-expanded="true"[^>]+data-workspace-control-id="workspace-pane:sections"/u,
    );
    expect(markup).toMatch(
      /aria-controls="([^"]+-pane-1)" aria-expanded="false"[^>]+data-workspace-control-id="workspace-pane:details"/u,
    );
    expect(markup).toMatch(
      /<aside aria-labelledby="([^"]+)-heading"[^>]+data-workspace-pane-id="sections"[^>]+id="\1"/u,
    );
    expect(markup).toContain("Section navigator");
    expect(markup).not.toContain("Details filter");
    expect(markup).toContain('aria-label="Close Sections"');
    expect(markup).toContain('data-workspace-control-source="pane"');
  });

  it("supports controlled closed state without rendering registered pane content", () => {
    const rendered: string[] = [];
    const markup = renderToStaticMarkup(
      <Workspace
        activePaneId={null}
        onActivePaneChange={() => undefined}
        panes={paneRegistrations(rendered)}
      />,
    );

    expect(rendered).toEqual([]);
    expect(markup).toContain('data-workspace-pane-open="false"');
    expect(markup).toContain('data-workspace-pane-trigger="sections"');
    expect(markup).not.toContain("<aside");
    expect(markup).not.toContain('aria-label="Close Sections"');
  });

  it("fails specifically for malformed registrations and pane state", () => {
    const panes = paneRegistrations();
    expect(() =>
      renderToStaticMarkup(
        <Workspace
          panes={[panes[0] as WorkspacePaneRegistration, panes[0] as WorkspacePaneRegistration]}
        />,
      ),
    ).toThrow('Duplicate workspace pane id "sections"');

    const sparse = new Array<WorkspacePaneRegistration>(1);
    expect(() => renderToStaticMarkup(<Workspace panes={sparse} />)).toThrow(
      "pane registrations must be a dense array without extra fields",
    );

    expect(() =>
      renderToStaticMarkup(
        <Workspace
          panes={[
            {
              ...panes[0],
              placement: "center",
            } as unknown as WorkspacePaneRegistration,
          ]}
        />,
      ),
    ).toThrow("pane registration at index 0 placement must be start or end");
    expect(() =>
      renderToStaticMarkup(
        <Workspace
          panes={[
            {
              ...panes[0],
              id: " padded ",
            } as WorkspacePaneRegistration,
          ]}
        />,
      ),
    ).toThrow("pane registration at index 0 id must be a non-empty unpadded string");
    expect(() =>
      renderToStaticMarkup(
        <Workspace activePaneId="missing" onActivePaneChange={() => undefined} panes={panes} />,
      ),
    ).toThrow('active pane ID "missing" is not registered');
    expect(() => renderToStaticMarkup(<Workspace activePaneId="sections" panes={panes} />)).toThrow(
      "controlled Workspace pane state requires onActivePaneChange",
    );
    expect(() =>
      renderToStaticMarkup(
        <Workspace
          activePaneId="sections"
          defaultActivePaneId="details"
          onActivePaneChange={() => undefined}
          panes={panes}
        />,
      ),
    ).toThrow("cannot receive both activePaneId and defaultActivePaneId");
  });

  it("rejects pane accessors without evaluating them and reserves pane control IDs", () => {
    const accessor = {
      icon: null,
      id: "accessor",
      placement: "start",
      render: () => null,
    } as Record<string, unknown>;
    Object.defineProperty(accessor, "label", {
      enumerable: true,
      get: () => {
        throw new Error("The pane getter must not run.");
      },
    });
    expect(() =>
      renderToStaticMarkup(
        <Workspace panes={[accessor as unknown as WorkspacePaneRegistration]} />,
      ),
    ).toThrow("workspace pane registration field label");

    const reservedControl = {
      icon: null,
      id: "workspace-pane:host",
      label: "Host action",
      onPress: () => undefined,
      placement: "utility",
    } satisfies WorkspaceToolbarControl;
    expect(() => renderToStaticMarkup(<Workspace toolbarControls={[reservedControl]} />)).toThrow(
      "uses the reserved pane prefix",
    );

    expect(() =>
      renderToStaticMarkup(
        <Workspace
          onActivePaneChange={
            "invalid" as unknown as NonNullable<WorkspaceProps["onActivePaneChange"]>
          }
          panes={paneRegistrations()}
        />,
      ),
    ).toThrow("active pane change handler must be a function");
  });
});
