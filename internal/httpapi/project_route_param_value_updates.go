package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"reflect"
	"strings"

	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/realtime"
)

type projectParamUpdateTarget struct {
	codeObj          projectview.Core
	codeObjVariant   projectview.Variant
	codeObjImpl      json.RawMessage
	sectionVariantID string
}

func frontendRouteBroadcastSelection(r *http.Request) realtime.Selection {
	selection := realtime.Selection{Type: realtime.ConnectionTypeFrontend}
	if requestInfo, ok := modes.RequestInfoFromRequest(r); ok {
		selection.ShareSessionID = strings.TrimSpace(requestInfo.ShareSessionID)
	}
	return selection
}

func broadcastSetParamEnteredValueUpdate(
	r *http.Request,
	deps ProjectRouteDependencies,
	runtime *projectstate.Runtime,
	beforeSnapshot projectstate.Snapshot,
	afterSnapshot projectstate.Snapshot,
	projectID string,
	sectionID string,
	sectionVariantID string,
	paramInfoID string,
) error {
	if deps.WebsocketHub == nil || runtime == nil {
		return nil
	}

	status := runtime.FrontendOpStatus()
	content, ok, err := projectParamUpdateContent(
		beforeSnapshot,
		afterSnapshot,
		status,
		projectID,
		sectionID,
		sectionVariantID,
		paramInfoID,
	)
	if err != nil {
		return err
	}
	if !ok {
		return broadcastProjectRouteStateUpdate(r, deps, runtime, afterSnapshot, projectID)
	}

	_, err = deps.WebsocketHub.BroadcastJSON(
		r.Context(),
		realtime.NewProjectParamUpdateMessage(content),
		frontendRouteBroadcastSelection(r),
	)
	return err
}

func projectParamUpdateContent(
	beforeSnapshot projectstate.Snapshot,
	afterSnapshot projectstate.Snapshot,
	status projectstate.FrontendOpStatus,
	projectID string,
	sectionID string,
	sectionVariantID string,
	paramInfoID string,
) (realtime.ProjectParamUpdateContent, bool, error) {
	afterView, err := projectview.SingleConfigByProjectID(afterSnapshot.Document, projectID)
	if err != nil {
		return realtime.ProjectParamUpdateContent{}, false, err
	}
	target, err := resolveProjectParamUpdateTarget(
		afterSnapshot.Document,
		afterView,
		projectID,
		sectionID,
		sectionVariantID,
		paramInfoID,
	)
	if err != nil {
		return realtime.ProjectParamUpdateContent{}, false, err
	}

	beforeView, err := projectview.SingleConfigByProjectID(beforeSnapshot.Document, projectID)
	if err != nil {
		return realtime.ProjectParamUpdateContent{}, false, nil
	}
	if !singleConfigOnlyChangedCodeObject(
		beforeView,
		afterView,
		target.codeObj.ID,
		target.codeObjVariant.ID,
		target.codeObjVariant.Impl,
	) {
		return realtime.ProjectParamUpdateContent{}, false, nil
	}

	return realtime.ProjectParamUpdateContent{
		ProjectConfigID:  strings.TrimSpace(projectID),
		SectionID:        strings.TrimSpace(sectionID),
		SectionVariantID: target.sectionVariantID,
		ParamInfoID:      target.codeObj.ID,
		CodeObj:          target.codeObj,
		CodeObjVariant:   target.codeObjVariant,
		CodeObjImpl:      append(json.RawMessage(nil), target.codeObjImpl...),
		CompletedOpIDs:   append([]string(nil), status.Completed...),
		PendingOpIDs:     append([]string(nil), status.Pending...),
	}, true, nil
}

func resolveProjectParamUpdateTarget(
	document projectstate.Document,
	view projectview.SingleConfig,
	projectID string,
	sectionID string,
	sectionVariantID string,
	paramInfoID string,
) (projectParamUpdateTarget, error) {
	project, err := document.ProjectByID(projectID)
	if err != nil {
		return projectParamUpdateTarget{}, err
	}
	_, codeObj, codeObjVariant, _, err := project.ResolveSectionCodeObjectForVariant(
		sectionID,
		sectionVariantID,
		paramInfoID,
	)
	if err != nil {
		return projectParamUpdateTarget{}, err
	}

	viewCodeObj, ok := view.CodeObjs[codeObj.ID]
	if !ok {
		return projectParamUpdateTarget{}, fmt.Errorf("project view code object %q missing", codeObj.ID)
	}
	viewCodeObjVariant, ok := view.CodeObjVariants[codeObjVariant.ID]
	if !ok {
		return projectParamUpdateTarget{}, fmt.Errorf("project view code object variant %q missing", codeObjVariant.ID)
	}
	viewCodeObjImpl, ok := view.CodeObjImpls[viewCodeObjVariant.Impl]
	if !ok {
		return projectParamUpdateTarget{}, fmt.Errorf("project view code object impl %q missing", viewCodeObjVariant.Impl)
	}

	resolvedSectionVariantID := strings.TrimSpace(sectionVariantID)
	if resolvedSectionVariantID == "" {
		resolvedSectionVariantID = view.ProjectConfig.SectionVariantMap[strings.TrimSpace(sectionID)]
	}

	return projectParamUpdateTarget{
		codeObj:          viewCodeObj,
		codeObjVariant:   viewCodeObjVariant,
		codeObjImpl:      append(json.RawMessage(nil), viewCodeObjImpl...),
		sectionVariantID: resolvedSectionVariantID,
	}, nil
}

func singleConfigOnlyChangedCodeObject(
	before projectview.SingleConfig,
	after projectview.SingleConfig,
	codeObjID string,
	codeObjVariantID string,
	codeObjImplID string,
) bool {
	before.CodeObjs = copyCoreMapWithout(before.CodeObjs, codeObjID)
	after.CodeObjs = copyCoreMapWithout(after.CodeObjs, codeObjID)
	before.CodeObjVariants = copyVariantMapWithout(before.CodeObjVariants, codeObjVariantID)
	after.CodeObjVariants = copyVariantMapWithout(after.CodeObjVariants, codeObjVariantID)
	before.CodeObjImpls = copyRawMessageMapWithout(before.CodeObjImpls, codeObjImplID)
	after.CodeObjImpls = copyRawMessageMapWithout(after.CodeObjImpls, codeObjImplID)
	return reflect.DeepEqual(before, after)
}

func copyCoreMapWithout(items map[string]projectview.Core, excludedID string) map[string]projectview.Core {
	next := make(map[string]projectview.Core, len(items))
	for id, item := range items {
		if id == excludedID {
			continue
		}
		next[id] = item
	}
	return next
}

func copyVariantMapWithout(items map[string]projectview.Variant, excludedID string) map[string]projectview.Variant {
	next := make(map[string]projectview.Variant, len(items))
	for id, item := range items {
		if id == excludedID {
			continue
		}
		next[id] = item
	}
	return next
}

func copyRawMessageMapWithout(items map[string]json.RawMessage, excludedID string) map[string]json.RawMessage {
	next := make(map[string]json.RawMessage, len(items))
	for id, item := range items {
		if id == excludedID {
			continue
		}
		next[id] = item
	}
	return next
}
