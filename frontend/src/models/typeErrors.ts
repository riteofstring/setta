import { createProjectState } from "./utils";

export const useTypeErrors = createProjectState(() => ({
  "d96cb110-6f72-435a-b745-2d55e277f983": {
    "0aa0f46a-e923-4528-a411-500cbda6e77b":
      "error: Argument 1 to 'process_data' of 'DataProcessor' has incompatible type 'List[Union[int, str, List[Any]]]'; expected 'List[Union[int, float, Dict[str, Union[int, float]]]]'",
  },
}));
