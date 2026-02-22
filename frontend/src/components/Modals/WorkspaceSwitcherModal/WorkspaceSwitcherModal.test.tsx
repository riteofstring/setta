import * as Dialog from "@radix-ui/react-dialog";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceSwitcherModal } from "./WorkspaceSwitcherModal";

vi.mock("state/actions/modal", () => ({
  closeModal: vi.fn(),
}));

describe("WorkspaceSwitcherModal", () => {
  it("renders desktop launcher management controls", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <Dialog.Root open>
          <Dialog.Content>
            <WorkspaceSwitcherModal />
          </Dialog.Content>
        </Dialog.Root>
      </MemoryRouter>,
    );

    expect(markup).toContain("Desktop Launcher");
    expect(markup).toContain("Setup Desktop App");
    expect(markup).toContain("Repair Desktop App");
    expect(markup).toContain("Remove Desktop App");
  });
});
