/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "testUtils/reactRefreshPreamble";
import { createProjectConfig } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HomeProjectGallery } from "./homeProjectGallery";

describe("HomeProjectGallery", () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it("renders the empty state when no projects are available", async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <HomeProjectGallery
            favoriteProjects={[]}
            nonFavoriteProjects={[]}
            totalProjectsCount={0}
            defaultProjectConfigId={null}
            selectedProjects={[]}
            onSelectProject={vi.fn()}
            onToggleProjectSelection={vi.fn()}
            selectionEnabled={true}
            isDeploymentMode={false}
            activeProjectId={null}
            onActivateProject={vi.fn()}
            onSetDefaultProject={vi.fn(async () => undefined)}
            galleryViewMode="list"
            fullScreenSurface
          />
        </MemoryRouter>,
      );
    });

    expect(host.textContent).toContain("Create a New Project!");
  });

  it("renders favorite and non-favorite list sections in list mode", async () => {
    const favoriteProject = createProjectConfig({
      id: "project-favorite",
      name: "Favorite",
    });
    const otherProject = createProjectConfig({
      id: "project-other",
      name: "Other",
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <HomeProjectGallery
            favoriteProjects={[favoriteProject]}
            nonFavoriteProjects={[otherProject]}
            totalProjectsCount={2}
            defaultProjectConfigId={favoriteProject.id}
            selectedProjects={[]}
            onSelectProject={vi.fn()}
            onToggleProjectSelection={vi.fn()}
            selectionEnabled={true}
            isDeploymentMode={false}
            activeProjectId={favoriteProject.id}
            onActivateProject={vi.fn()}
            onSetDefaultProject={vi.fn(async () => undefined)}
            galleryViewMode="list"
            fullScreenSurface
          />
        </MemoryRouter>,
      );
    });

    expect(host.textContent).toContain("Favourites");
    expect(host.textContent).toContain("Other Projects");
    expect(host.querySelector('[data-testid="home-project-list"]')).not.toBe(
      null,
    );
    expect(
      host.querySelectorAll('[data-testid="home-project-list-row"]').length,
    ).toBe(2);
  });
});
