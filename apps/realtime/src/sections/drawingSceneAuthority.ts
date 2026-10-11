import type { WorkspaceSectionData } from "@riteofstring/setta";

type DrawingSceneCommit = {
  key: string;
  revision: number;
};

function sceneKey(scene: WorkspaceSectionData): string {
  return JSON.stringify(scene);
}

export class DrawingSceneAuthority {
  private acknowledgedRevision = 0;
  private localRevision = 0;
  private visibleSceneKey: string;

  public constructor(initialScene: WorkspaceSectionData) {
    this.visibleSceneKey = sceneKey(initialScene);
  }

  public localChange(): void {
    this.localRevision += 1;
  }

  public prepareCommit(scene: WorkspaceSectionData): DrawingSceneCommit {
    return { key: sceneKey(scene), revision: this.localRevision };
  }

  public acknowledge(
    commit: DrawingSceneCommit,
    currentScene: WorkspaceSectionData,
  ): boolean {
    if (
      commit.revision !== this.localRevision ||
      commit.key !== sceneKey(currentScene)
    ) {
      return false;
    }
    this.acknowledgedRevision = commit.revision;
    this.visibleSceneKey = commit.key;
    return true;
  }

  public shouldLoad(scene: WorkspaceSectionData): boolean {
    return (
      this.acknowledgedRevision === this.localRevision &&
      this.visibleSceneKey !== sceneKey(scene)
    );
  }

  public loaded(scene: WorkspaceSectionData): void {
    if (this.acknowledgedRevision === this.localRevision) {
      this.visibleSceneKey = sceneKey(scene);
    }
  }
}
