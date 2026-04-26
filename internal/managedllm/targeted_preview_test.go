package managedllm

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"setta/internal/agentruns"
	"setta/internal/llmconfig"
	"setta/internal/managedchat"
	"setta/internal/mcpx"
	"setta/internal/realtime"
	"setta/internal/tools"
)

func TestExecutorExecuteStreamsTargetedToolArgumentPreviewKinds(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name              string
		toolName          string
		toolArgumentsJSON string
		previewMetadata   *tools.ToolArgumentPreviewMetadata
		temporaryIDs      map[string]string
		expectedKind      tools.PreviewKind
		expectedValue     string
		expectedTargetIDs map[string][]string
	}{
		{
			name:              "code preview with canonical section id",
			toolName:          "setta__set_code",
			toolArgumentsJSON: `{"projectConfigId":"project-alpha","sectionId":"allowed-section","code":"print('preview')\n"}`,
			previewMetadata: &tools.ToolArgumentPreviewMetadata{
				TargetIDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection: {"sectionId"},
				},
				PreviewValuePath: "code",
				PreviewKind:      tools.PreviewKindCode,
			},
			temporaryIDs: map[string]string{
				"project-alpha":   "11",
				"allowed-section": "14",
			},
			expectedKind:  tools.PreviewKindCode,
			expectedValue: "print('preview')\n",
			expectedTargetIDs: map[string][]string{
				"section": {"allowed-section"},
			},
		},
		{
			name:              "callable preview with canonical section id",
			toolName:          "setta__set_callable",
			toolArgumentsJSON: `{"projectConfigId":"project-alpha","sectionId":"allowed-callable-section","callableName":"sorted","refetchParams":false}`,
			previewMetadata: &tools.ToolArgumentPreviewMetadata{
				TargetIDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection: {"sectionId"},
				},
				PreviewValuePath: "callableName",
				PreviewKind:      tools.PreviewKindCallableName,
			},
			temporaryIDs: map[string]string{
				"project-alpha":            "11",
				"allowed-callable-section": "25",
			},
			expectedKind:  tools.PreviewKindCallableName,
			expectedValue: "sorted",
			expectedTargetIDs: map[string][]string{
				"section": {"allowed-callable-section"},
			},
		},
		{
			name:              "param preview with canonical section and code-object ids",
			toolName:          "setta__set_param_entered_value",
			toolArgumentsJSON: `{"projectConfigId":"project-alpha","sectionId":"allowed-params-section","paramInfoId":"allowed-param","value":"updated"}`,
			previewMetadata: &tools.ToolArgumentPreviewMetadata{
				TargetIDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection:    {"sectionId"},
					tools.IDTypeCodeObject: {"paramInfoId"},
				},
				PreviewValuePath: "value",
				PreviewKind:      tools.PreviewKindParamValue,
			},
			temporaryIDs: map[string]string{
				"project-alpha":          "11",
				"allowed-params-section": "20",
				"allowed-param":          "22",
			},
			expectedKind:  tools.PreviewKindParamValue,
			expectedValue: "updated",
			expectedTargetIDs: map[string][]string{
				"section": {"allowed-params-section"},
				"codeObj": {"allowed-param"},
			},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			requestCount := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "text/event-stream")
				flusher, ok := w.(http.Flusher)
				if !ok {
					t.Fatal("expected flusher")
				}
				switch requestCount {
				case 0:
					fmt.Fprintf(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"tool-call-1\",\"type\":\"function\",\"function\":{\"name\":%s,\"arguments\":%s}}]},\"finish_reason\":\"tool_calls\"}]}\n\n", jsonQuoted(testCase.toolName), jsonQuoted(testCase.toolArgumentsJSON))
					flusher.Flush()
					fmt.Fprint(w, "data: [DONE]\n\n")
				case 1:
					fmt.Fprint(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Preview applied\"},\"finish_reason\":\"stop\"}]}\n\n")
					flusher.Flush()
					fmt.Fprint(w, "data: [DONE]\n\n")
				default:
					http.Error(w, "unexpected request", http.StatusInternalServerError)
					return
				}
				requestCount++
			}))
			defer server.Close()

			broadcaster := &captureBroadcaster{}
			live := managedchat.NewLiveRuntime(managedchat.LiveRuntimeOptions{Broadcaster: broadcaster})
			run := newManagedChatTestRun()
			live.ActivateRun(run)

			toolClient := &stubToolClient{
				discoverableTools: map[string]mcpx.ToolDescriptor{
					testCase.toolName: {
						ServerID:       mcpx.DefaultServerID,
						NamespacedName: testCase.toolName,
						RemoteName:     strings.TrimPrefix(testCase.toolName, "setta__"),
						Description:    "Preview test tool.",
						InputSchema: map[string]any{
							"type": "object",
						},
						Metadata: &tools.Metadata{
							Kind:       tools.KindDiscoverable,
							AccessType: tools.AccessTypeWrite,
							ToolArgumentPreview: &tools.ToolArgumentPreviewMetadata{
								TargetIDPathsByType: testCase.previewMetadata.TargetIDPathsByType,
								PreviewValuePath:    testCase.previewMetadata.PreviewValuePath,
								PreviewKind:         testCase.previewMetadata.PreviewKind,
							},
						},
					},
				},
				call: func(context.Context, string, map[string]any, map[string]any) (mcpx.ToolCallResult, error) {
					return mcpx.ToolCallResult{
						StructuredContent: map[string]any{"status": "ok"},
						Text:              "{\"status\":\"ok\"}",
					}, nil
				},
			}

			executor := NewExecutor(ExecutorOptions{
				Live:       live,
				Tools:      toolClient,
				HTTPClient: server.Client(),
			})
			_, err := executor.Execute(context.Background(), agentruns.ExecutionRequest{
				Run: run,
				LLMConfig: llmconfig.Config{
					ID:        "primary",
					Model:     "gpt-4o-mini",
					Provider:  "openai",
					BaseURL:   server.URL + "/v1",
					APIKeyEnv: "OPENAI_API_KEY",
				},
				MCPServerIDs: []string{mcpx.DefaultServerID},
				APIKeys: map[string]string{
					"OPENAI_API_KEY": "secret",
				},
				TemporaryIDs:    previewTestTemporaryIDs{mapping: testCase.temporaryIDs},
				SystemPrompt:    "System prompt",
				ProjectConfigID: "project-alpha",
				ChatID:          "chat-alpha",
				Inputs: map[string]any{
					"runType": "llm_chat",
					"messages": []any{
						map[string]any{
							"id":   "user-1",
							"role": "user",
							"content": []any{
								map[string]any{"type": "text", "text": "Preview this tool call"},
							},
							"attachments": []any{},
						},
					},
				},
			})
			if err != nil {
				t.Fatalf("execute managed llm preview stream: %v", err)
			}

			var previewEvent *realtime.ToolArgumentPreviewDeltaEvent
			for _, message := range broadcaster.Messages() {
				chunk, ok := message.Content.Chunk.(realtime.ToolArgumentPreviewDeltaEvent)
				if !ok {
					continue
				}
				previewEvent = &chunk
				break
			}
			if previewEvent == nil {
				t.Fatalf("expected tool preview event in %#v", broadcaster.Messages())
			}
			if previewEvent.ToolName != testCase.toolName {
				t.Fatalf("unexpected preview event %#v", previewEvent)
			}
			if previewEvent.PreviewKind != testCase.expectedKind {
				t.Fatalf("unexpected preview kind %#v", previewEvent)
			}
			if previewEvent.PreviewValueDelta != testCase.expectedValue {
				t.Fatalf("unexpected preview delta %#v", previewEvent)
			}
			if !previewStringSliceMapsEqual(previewEvent.TargetIDsByType.IDsByType(), testCase.expectedTargetIDs) {
				t.Fatalf("unexpected target ids %#v", previewEvent.TargetIDsByType)
			}
		})
	}
}

func previewStringSliceMapsEqual(left map[string][]string, right map[string][]string) bool {
	if len(left) != len(right) {
		return false
	}
	for key, leftValues := range left {
		rightValues, ok := right[key]
		if !ok || len(leftValues) != len(rightValues) {
			return false
		}
		for index, value := range leftValues {
			if rightValues[index] != value {
				return false
			}
		}
	}
	return true
}

func jsonQuoted(value string) string {
	encoded, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return string(encoded)
}
