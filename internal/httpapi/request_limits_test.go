package httpapi

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/chat"
)

func TestEndpointRejectsOversizedOrdinaryJSONBeforeHandler(t *testing.T) {
	handler := NewHandler(HandlerConfig{Metadata: BackendMetadata{Name: BackendName, Version: "test"}})
	body := `{"id":"` + strings.Repeat("x", int(defaultRequestBodyLimitBytes)+1) + `"}`

	errResponse := postRaw[ErrorResponse](t, handler, "/workspaces/select", body, http.StatusRequestEntityTooLarge)

	if errResponse.Error.Code != "request_body_too_large" {
		t.Fatalf("error code = %q, want request_body_too_large", errResponse.Error.Code)
	}
	if !strings.Contains(errResponse.Error.Message, "request body exceeds") {
		t.Fatalf("error message = %q, want request body limit", errResponse.Error.Message)
	}
}

func TestEndpointRejectsOversizedStreamedJSONDuringDecode(t *testing.T) {
	handler := newWorkspaceHandler(t, nil, nil)
	body := `{"id":"` + strings.Repeat("x", int(defaultRequestBodyLimitBytes)+1) + `"}`
	request := httptest.NewRequest(http.MethodPost, "/workspaces/select", bytes.NewBufferString(body))
	request.ContentLength = -1
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want %d, body: %s", response.Code, http.StatusRequestEntityTooLarge, response.Body.String())
	}
	var errResponse ErrorResponse
	if err := json.NewDecoder(response.Body).Decode(&errResponse); err != nil {
		t.Fatalf("decode error response: %v", err)
	}
	if errResponse.Error.Code != "request_body_too_large" {
		t.Fatalf("error code = %q, want request_body_too_large", errResponse.Error.Code)
	}
}

func TestChatImageBytesEndpointRejectsOversizedDecodedPayloadBeforePersistence(t *testing.T) {
	handler, appDataDir := newChatHandlerWithAppDataDir(t, nil)
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	conversation := postJSON[chat.Conversation](t, handler, "/chat/conversations/create", CreateConversationRequest{
		WorkspaceID: opened.Workspace.ID,
	}, http.StatusOK)
	payload := CreateChatImageAttachmentFromBytesRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		FileName:       "oversized.png",
		DataBase64:     strings.Repeat("A", base64.StdEncoding.EncodedLen(chat.MaxImageAttachmentBytes+1)),
	}
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal oversized image request: %v", err)
	}
	if int64(len(body)) >= chatImageAttachmentRequestBodyLimitBytes() {
		t.Fatalf("test body length = %d, want below endpoint request limit %d", len(body), chatImageAttachmentRequestBodyLimitBytes())
	}

	errResponse := postRaw[ErrorResponse](t, handler, "/chat/attachments/images/from-bytes", string(body), http.StatusBadRequest)

	if errResponse.Error.Code != "chat_image_attachment_too_large" {
		t.Fatalf("error code = %q, want chat_image_attachment_too_large", errResponse.Error.Code)
	}
	attachmentsPath := filepath.Join(appDataDir, "workspaces", opened.Workspace.ID, "conversations", conversation.ID, "attachments")
	if _, err := os.Stat(attachmentsPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("attachments path stat error = %v, want not exists", err)
	}
}
