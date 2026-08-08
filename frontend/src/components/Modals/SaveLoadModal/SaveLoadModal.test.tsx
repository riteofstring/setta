import * as Dialog from "@radix-ui/react-dialog";
import { renderToStaticMarkup } from "react-dom/server";
import { createProjectConfig } from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import {
  SAVE_LOAD_DEFAULT_VIEW_MODE,
  SaveLoadModal,
  SaveLoadModalModeEnum,
} from "./SaveLoadModal";

vi.mock("state/actions/modal", () => ({
  closeModal: vi.fn(),
}));

describe("SaveLoadModal", () => {
  it("defaults to list view mode to avoid eager thumbnail rendering", () => {
    expect(SAVE_LOAD_DEFAULT_VIEW_MODE).toBe("list");
  });

  it("renders list rows by default when files are available", () => {
    const firstConfig = createProjectConfig({
      id: "config-b",
      name: "Beta Config",
    });
    const secondConfig = createProjectConfig({
      id: "config-a",
      name: "Alpha Config",
    });

    const markup = renderToStaticMarkup(
      <Dialog.Root open>
        <Dialog.Content>
          <SaveLoadModal
            open
            modalMode={SaveLoadModalModeEnum.load}
            files={[firstConfig, secondConfig]}
            onClickActionButton={() => {}}
            title="Load Project Config"
            buttonText="Load"
            placeholder=""
          />
        </Dialog.Content>
      </Dialog.Root>,
    );

    expect(markup).toContain('data-testid="save-load-config-list-row"');
    expect(markup).not.toContain('data-testid="save-load-config-card"');
  });
});
