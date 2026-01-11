import { withProjectState, withResetFn } from "state/utils";
import { immer } from "zustand/middleware/immer";
import { createWithEqualityFn } from "zustand/traditional";

export type ZustandDndState = {
  activeId: string | null;
  overId: string | null;
};

export const useDndState = withProjectState(
  createWithEqualityFn(
    immer(
      withResetFn<ZustandDndState>(() => ({
        activeId: null,
        overId: null,
      })),
    ),
  ),
);

export function setActiveDnd(id: string) {
  useDndState.setState({
    activeId: id,
  });
}
