import { callOpenAPI, res200 } from "@setta/app-subsystem-frontend-sdk";
import { Editable } from "components/Utils/Editable";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { setProjectConfigName } from "openapi/http";
import type { ChangeEvent } from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useNameValidationErrors, useProjectState } from "state/definitions";
import { useEditableOnSubmit } from "state/hooks/editableText";
import { C } from "utils/c";
import { PAGE_LOAD_TYPES, pathRelativeToProject } from "utils/constants";
import { validateProjectNameInput } from "utils/nameValidation";
const editing =
  "flex-1 box-border [border-width:0_0_1px_0] border-solid bg-transparent focus:border-blue-300 focus-visible:ring-0 focus-visible:outline-none w-full ";
const notEditing =
  "flex-1 box-border border-b border-solid border-transparent bg-transparent focus-visible:border-blue-300 focus-visible:ring-0 focus-visible:outline-none w-full truncate";
export function ProjectName() {
  return (
    <header
      className="mb-2 flex w-full flex-col flex-wrap   tracking-tight "
      {...getFloatingBoxHandlers({
        content:
          "Your Project's Name and Config Name, editable all in one spot!",
      })}
    >
      <ProjectNameOnly />
    </header>
  );
}
function ProjectNameOnly() {
  const {
    inputValue: localName,
    onChange,
    onBlur,
    onKeyDown,
    blurTriggeredByEscapeKey,
    serverError,
    allowReserved,
  } = useEditableProjectName();
  const backendErrors = useNameValidationErrors((state) => state.projectErrors);
  const validationError = validateProjectNameInput(localName, {
    allowReserved,
  });
  const backendErrorMessage = backendErrors?.join("\n") ?? null;
  const errorMessage = validationError ?? serverError ?? backendErrorMessage;
  let errorClassName = "";
  if (errorMessage) {
    errorClassName = "border-red-400 text-red-600 dark:text-red-300";
  }
  function ignoreHover() {}
  return (
    <>
      <div data-setting-anchor="core.project.name">
        <Editable
          titleProps={{
            editing: `${editing} text-xl text-setta-900 dark:text-setta-50 font-bold ${errorClassName}`,
            notEditing: `${notEditing} text-xl text-setta-900 dark:text-setta-50 font-bold ${errorClassName}`,
          }}
          value={localName}
          onChange={onChange}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          onMouseEnter={ignoreHover}
          onMouseLeave={ignoreHover}
          blurTriggeredByEscapeKey={blurTriggeredByEscapeKey}
        />
      </div>
      {errorMessage && (
        <p className="mt-1 text-xs text-red-500">{errorMessage}</p>
      )}
    </>
  );
}
function useEditableProjectName() {
  const { projectConfigId, name } = useProjectState((x) => ({
    projectConfigId: x.projectConfig.id,
    name: x.projectConfig.name,
  }));
  const allowReserved =
    name.trim().toLowerCase() === C.SETTINGS_PROJECT_NAME.toLowerCase();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const normalizeName = (value: string) => value.trim();
  function extractErrorDetail(data: unknown): string | null {
    if (!data || typeof data !== "object") {
      return null;
    }
    if ("detail" in data) {
      const detail = (
        data as {
          detail?: unknown;
        }
      ).detail;
      if (typeof detail === "string") {
        return detail;
      }
    }
    return null;
  }
  async function condition(v: string) {
    const normalized = normalizeName(v);
    const validationError = validateProjectNameInput(normalized, {
      allowReserved,
    });
    if (validationError) {
      setServerError(null);
      return false;
    }
    const res = await callOpenAPI(
      setProjectConfigName({
        body: {
          projectConfigId,
          newName: normalized,
        },
      } as Parameters<typeof setProjectConfigName>[0]),
    );
    if (res200(res)) {
      setServerError(null);
      return true;
    }
    const detail = extractErrorDetail(res.data);
    setServerError(detail ?? "Unable to rename project.");
    return false;
  }
  async function onSetName(v: string) {
    const normalized = normalizeName(v);
    navigate(pathRelativeToProject(normalized), {
      state: { pageLoadType: PAGE_LOAD_TYPES.CHANGE_PROJECT_CONFIG_NAME },
    });
  }
  const editable = useEditableOnSubmit(
    name,
    onSetName,
    condition,
    false,
    normalizeName,
  );
  function onChange(event: ChangeEvent<HTMLInputElement> | string): void {
    setServerError(null);
    editable.onChange(event);
  }
  return {
    ...editable,
    onChange,
    serverError,
    allowReserved,
  };
}
