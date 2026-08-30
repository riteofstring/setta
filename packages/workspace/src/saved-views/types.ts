export type WorkspaceSavedViewsOperation =
  | "activate"
  | "create"
  | "delete"
  | "enable"
  | "rename"
  | "reorder"
  | "visibility";

export type WorkspaceSavedViewCreateInput = {
  id?: string;
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
