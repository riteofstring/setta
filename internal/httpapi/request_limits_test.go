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

func TestChatImagePathEndpointRejectsOversizedSourceBeforePersistence(t *testing.T) {
	handler, appDataDir := newChatHandlerWithAppDataDir(t, nil)
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	conversation := postJSON[chat.Conversation](t, handler, "/chat/conversations/create", CreateConversationRequest{
		WorkspaceID: opened.Workspace.ID,
	}, http.StatusOK)
	sourcePath := filepath.Join(t.TempDir(), "oversized.png")
	writeSizedFile(t, sourcePath, int64(chat.MaxImageAttachmentBytes+1))

	errResponse := postJSON[ErrorResponse](t, handler, "/chat/attachments/images/from-path", CreateChatImageAttachmentFromPathRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		SourcePath:     sourcePath,
	}, http.StatusBadRequest)

	if errResponse.Error.Code != "create_chat_image_attachment_failed" {
		t.Fatalf("error code = %q, want create_chat_image_attachment_failed", errResponse.Error.Code)
	}
	if !strings.Contains(errResponse.Error.Message, "maximum is") {
		t.Fatalf("error message = %q, want size limit", errResponse.Error.Message)
	}
	attachmentsPath := filepath.Join(appDataDir, "workspaces", opened.Workspace.ID, "conversations", conversation.ID, "attachments")
	if _, err := os.Stat(attachmentsPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("attachments path stat error = %v, want not exists", err)
	}
}

func TestChatImagePathEndpointRejectsMissingAndDirectorySources(t *testing.T) {
	handler, _ := newChatHandlerWithAppDataDir(t, nil)
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	conversation := postJSON[chat.Conversation](t, handler, "/chat/conversations/create", CreateConversationRequest{
		WorkspaceID: opened.Workspace.ID,
	}, http.StatusOK)

	for _, testCase := range []struct {
		name        string
		sourcePath  string
		wantMessage string
	}{
		{
			name:        "missing",
			sourcePath:  filepath.Join(t.TempDir(), "missing.png"),
			wantMessage: "stat image attachment source",
		},
		{
			name:        "directory",
			sourcePath:  t.TempDir(),
			wantMessage: "image attachment source is a directory",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			errResponse := postJSON[ErrorResponse](t, handler, "/chat/attachments/images/from-path", CreateChatImageAttachmentFromPathRequest{
				WorkspaceID:    opened.Workspace.ID,
				ConversationID: conversation.ID,
				SourcePath:     testCase.sourcePath,
			}, http.StatusBadRequest)

			if errResponse.Error.Code != "create_chat_image_attachment_failed" {
				t.Fatalf("error code = %q, want create_chat_image_attachment_failed", errResponse.Error.Code)
			}
			if !strings.Contains(errResponse.Error.Message, testCase.wantMessage) {
				t.Fatalf("error message = %q, want %q", errResponse.Error.Message, testCase.wantMessage)
			}
		})
	}
}

func TestChatImagePathEndpointCreatesAttachmentFromValidSource(t *testing.T) {
	handler, _ := newChatHandlerWithAppDataDir(t, nil)
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	conversation := postJSON[chat.Conversation](t, handler, "/chat/conversations/create", CreateConversationRequest{
		WorkspaceID: opened.Workspace.ID,
	}, http.StatusOK)
	sourcePath := filepath.Join(t.TempDir(), "valid-source.png")
	writeTinyPNG(t, sourcePath)

	attachment := postJSON[chat.ImageAttachment](t, handler, "/chat/attachments/images/from-path", CreateChatImageAttachmentFromPathRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		SourcePath:     sourcePath,
	}, http.StatusOK)

	if attachment.FileName != "valid-source.png" || attachment.MimeType != "image/png" || attachment.Width != 2 || attachment.Height != 2 {
		t.Fatalf("attachment = %+v, want valid-source.png image/png 2x2", attachment)
	}
	if len(attachment.Variants) != 4 {
		t.Fatalf("attachment variants = %+v, want 4 variants", attachment.Variants)
	}
}

func writeSizedFile(t *testing.T, path string, size int64) {
	t.Helper()

	file, err := os.Create(path)
	if err != nil {
		t.Fatalf("create sized file: %v", err)
	}
	if err := file.Truncate(size); err != nil {
		_ = file.Close()
		t.Fatalf("truncate sized file: %v", err)
	}
	if err := file.Close(); err != nil {
		t.Fatalf("close sized file: %v", err)
	}
}

func writeTinyPNG(t *testing.T, path string) {
	t.Helper()

	const tinyPNGBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAG0lEQVR4nGL6z8DA8J+BiZHh/38GBkAAAAD//x0hBAKGdL17AAAAAElFTkSuQmCC"
	data, err := base64.StdEncoding.DecodeString(tinyPNGBase64)
	if err != nil {
		t.Fatalf("decode tiny PNG fixture: %v", err)
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatalf("write tiny PNG fixture: %v", err)
	}
}
