export type WorkspaceSavedViewsOperation =
  | "activate"
  | "create"
  | "delete"
  | "enable"
  | "rename"
  | "reorder"
  | "tab"
  | "visibility";

export type WorkspaceSavedViewCreateInput = {
  id?: string;
  isTab?: boolean;
  name?: string;
};

export type WorkspaceSavedViewsEnableInput = WorkspaceSavedViewCreateInput;

export type WorkspaceSavedViewsOperationResult =
  | {
      status: "applied";
      activeViewId: string;
      viewId: string;
    }
  | {
      status: "unchanged";
      activeViewId: string;
      viewId: string;
    }
  | {
      status: "unavailable";
      reason: string;
    };
