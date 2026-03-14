/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "testUtils/reactRefreshPreamble";
import { createProjectConfig } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeProjectGallery } from "./HomeProjectGallery";

const mocks = vi.hoisted(() => ({
  setHomeProjectGalleryViewMode: vi.fn(),
}));

vi.mock("state/actions/localStorage", () => ({
  setHomeProjectGalleryViewMode: mocks.setHomeProjectGalleryViewMode,
}));

vi.mock("components/AppHeader/SearchBar/HomePageSearch", () => ({
  HomePageSearchBar: ({ className }: { className?: string }) => (
    <div data-testid="mock-home-search" className={className}>
      Search
    </div>
  ),
}));

vi.mock("components/ProjectConfigs/ProjectConfigThumbnailSurface", () => ({
  ProjectConfigThumbnailSurface: ({ overlay }: { overlay?: unknown }) => (
    <div data-testid="mock-project-thumbnail">{overlay}</div>
  ),
}));

describe("HomeProjectGallery", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.setHomeProjectGalleryViewMode.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders the empty-state prompt when there are no projects", () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <HomeProjectGallery
            favoriteProjects={[]}
            nonFavoriteProjects={[]}
            totalProjectsCount={0}
            defaultProjectConfigId={null}
            selectedProjects={[]}
            onSelectProject={() => undefined}
            onToggleProjectSelection={() => undefined}
            selectionEnabled={true}
            isDeploymentMode={false}
            activeProjectId={null}
            onActivateProject={() => undefined}
            onSetDefaultProject={async () => undefined}
            onToggleFavoriteProjectConfig={() => undefined}
            galleryViewMode="thumbnails"
            fullScreenSurface
          />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain("Create a New Project!");
  });

  it("renders favourites and other-project sections in list mode", () => {
    const favoriteProject = createProjectConfig({
      id: "project-favorite",
      name: "Favorite Project",
    });
    const otherProject = createProjectConfig({
      id: "project-other",
      name: "Other Project",
    });

    act(() => {
      root.render(
        <MemoryRouter>
          <HomeProjectGallery
            favoriteProjects={[favoriteProject]}
            nonFavoriteProjects={[otherProject]}
            totalProjectsCount={2}
            defaultProjectConfigId={favoriteProject.id}
            selectedProjects={[favoriteProject.id]}
            onSelectProject={() => undefined}
            onToggleProjectSelection={() => undefined}
            selectionEnabled={true}
            isDeploymentMode={false}
            activeProjectId={favoriteProject.id}
            onActivateProject={() => undefined}
            onSetDefaultProject={async () => undefined}
            onToggleFavoriteProjectConfig={() => undefined}
            galleryViewMode="list"
            fullScreenSurface
          />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain("Favourites");
    expect(container.textContent).toContain("Other Projects");
    expect(container.textContent).toContain("Favorite Project");
    expect(container.textContent).toContain("Other Project");
    expect(
      container.querySelector('[data-testid="mock-home-search"]'),
    ).toBeTruthy();
  });

  it("delegates gallery view-mode toggles to the local-storage action", () => {
    const project = createProjectConfig({
      id: "project-1",
      name: "Project One",
    });

    act(() => {
      root.render(
        <MemoryRouter>
          <HomeProjectGallery
            favoriteProjects={[]}
            nonFavoriteProjects={[project]}
            totalProjectsCount={1}
            defaultProjectConfigId={null}
            selectedProjects={[]}
            onSelectProject={() => undefined}
            onToggleProjectSelection={() => undefined}
            selectionEnabled={true}
            isDeploymentMode={false}
            activeProjectId={null}
            onActivateProject={() => undefined}
            onSetDefaultProject={async () => undefined}
            onToggleFavoriteProjectConfig={() => undefined}
            galleryViewMode="thumbnails"
            fullScreenSurface
          />
        </MemoryRouter>,
      );
    });

    const listButton = container.querySelector(
      '[data-testid="home-project-view-list"]',
    );
    const thumbnailButton = container.querySelector(
      '[data-testid="home-project-view-thumbnails"]',
    );

    act(() => {
      listButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
      thumbnailButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(mocks.setHomeProjectGalleryViewMode).toHaveBeenCalledTimes(2);
    expect(mocks.setHomeProjectGalleryViewMode).toHaveBeenNthCalledWith(
      1,
      "list",
    );
    expect(mocks.setHomeProjectGalleryViewMode).toHaveBeenNthCalledWith(
      2,
      "thumbnails",
    );
  });
});
