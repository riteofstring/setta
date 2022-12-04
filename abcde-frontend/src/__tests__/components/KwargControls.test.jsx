import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SectionContainer from "components/UI/Section/SectionContainer/SectionContainer";
import { NULL_OBJ_ID } from "utils/constants";
import { renderUseGetKwargInfos } from "__tests__utils/renderHooks";
import {
  createStoreWrapperWithData,
  sectionIdFromName,
} from "__tests__utils/utils";

test("Adding kwarg on parameter-only section should work", async () => {
  const { store, wrapper } = await createStoreWrapperWithData({});
  const sectionId = sectionIdFromName(store, "The2ndOtherParameters");
  const props = { sectionId, parentId: null, depth: 0 };

  render(<SectionContainer {...props} />, { wrapper });

  // there should be no kwargs
  let { result } = renderUseGetKwargInfos(sectionId, NULL_OBJ_ID, wrapper);
  expect(result.current.length).toEqual(0);
  const initialLength = result.current.length;

  const button = screen.getByRole("button", { name: "Add Kwarg" });
  await userEvent.click(button);

  // now there should be +1 kwarg
  ({ result } = renderUseGetKwargInfos(sectionId, NULL_OBJ_ID, wrapper));
  expect(result.current.length).toEqual(initialLength + 1);
});
