package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"reflect"
	"testing"

	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/contracts"
	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/project/aggregate"
)

func TestHandlerForwardsClosedClipboardCopyAndPasteCommands(t *testing.T) {
	service := &stubProjectService{snapshot: contracts.FixtureProjectSnapshotV2()}
	payload := projectClipboardPayloadForHTTPTest()
	var copied contracts.CopyProjectClipboardRequestV2
	var pasted contracts.PasteProjectClipboardRequestV2
	service.copyProjectClipboard = func(_ context.Context, request contracts.CopyProjectClipboardRequestV2) (contracts.CopyProjectClipboardResponseV2, error) {
		copied = request
		return contracts.CopyProjectClipboardResponseV2{Payload: payload}, nil
	}
	service.pasteProjectClipboard = func(_ context.Context, request contracts.PasteProjectClipboardRequestV2) (contracts.PasteProjectClipboardResponseV2, error) {
		pasted = request
		return contracts.PasteProjectClipboardResponseV2{}, aggregate.ErrRevisionConflict
	}
	handler := newHandlerForTest(t, service)

	copyResponse := postJSON(
		handler,
		contracts.ProjectClipboardCopyPathV2,
		`{"projectId":"project:fixture","observedRevision":1,"rootSectionIds":["callable:clipboard"]}`,
	)
	if copyResponse.Code != http.StatusOK {
		t.Fatalf("copy status = %d; body = %s", copyResponse.Code, copyResponse.Body.String())
	}
	wantCopy := contracts.CopyProjectClipboardRequestV2{
		ProjectID:        "project:fixture",
		ObservedRevision: 1,
		RootSectionIDs:   []string{"callable:clipboard"},
	}
	if !reflect.DeepEqual(copied, wantCopy) {
		t.Fatalf("copy request = %#v, want %#v", copied, wantCopy)
	}

	encodedPayload, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal clipboard payload: %v", err)
	}
	pasteResponse := postJSON(
		handler,
		contracts.ProjectClipboardPastePathV2,
		`{"projectId":"project:fixture","expectedRevision":1,"payload":`+string(encodedPayload)+`}`,
	)
	if pasteResponse.Code != http.StatusConflict {
		t.Fatalf("paste status = %d; body = %s", pasteResponse.Code, pasteResponse.Body.String())
	}
	assertErrorCode(t, pasteResponse, contracts.APIErrorCodeRevisionConflictV2)
	if pasted.ProjectID != "project:fixture" || pasted.ExpectedRevision != 1 || !reflect.DeepEqual(pasted.Payload, payload) {
		t.Fatalf("paste request = %#v", pasted)
	}

	invalid := postJSON(
		handler,
		contracts.ProjectClipboardCopyPathV2,
		`{"projectId":"project:fixture","observedRevision":1,"rootSectionIds":["callable:clipboard"],"legacy":true}`,
	)
	if invalid.Code != http.StatusBadRequest {
		t.Fatalf("invalid clipboard status = %d; body = %s", invalid.Code, invalid.Body.String())
	}
	assertErrorCode(t, invalid, contracts.APIErrorCodeInvalidRequestV2)
}

func projectClipboardPayloadForHTTPTest() contracts.ProjectClipboardPayloadV1 {
	return contracts.ProjectClipboardPayloadV1{
		Version:        contracts.ProjectClipboardPayloadVersionV1,
		RootSectionIDs: []string{"callable:clipboard"},
		Callables: []contracts.CallableV2{{
			ID:                 "callable:clipboard",
			Name:               "Clipboard callable",
			AuthoredExpression: "",
			Parameters:         []contracts.ParameterV2{},
		}},
		ParameterDictionaries: []contracts.ParameterDictionaryV2{},
		Lists:                 []contracts.ListV2{},
	}
}
