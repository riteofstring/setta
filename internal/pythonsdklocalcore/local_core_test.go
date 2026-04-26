package pythonsdklocalcore

import (
	"bytes"
	"encoding/json"
	"testing"

	"setta/internal/pythonsdkcontracts"
)

func TestRunWritesHandshakeAndHandlesRealtimeRenderCommand(t *testing.T) {
	t.Helper()

	var input bytes.Buffer
	encoder := json.NewEncoder(&input)
	if err := encoder.Encode(pythonsdkcontracts.LocalCoreCommandEnvelope{
		CallID:      "call-1",
		CommandName: CommandListenerRenderRealtimeDependencyValues,
		Payload: map[string]any{
			"dependencyCatalog": map[string]any{
				"entries": []map[string]any{
					{
						"dependencyKey":    "section-config",
						"name":             "Config",
						"fullPathName":     "Config",
						"dependencies":     []string{"section-config.param-count"},
						"includeInCodegen": true,
						"sectionType":      "Dict",
					},
					{
						"dependencyKey":       "section-config.param-count",
						"name":                "count",
						"fullPathName":        "Config.count",
						"includeInCodegen":    true,
						"codeObjType":         "CodeParam",
						"valueRepresentation": "expression",
					},
				},
			},
			"currentDependencyValues": map[string]any{
				"entries": []map[string]any{
					{
						"dependencyKey": "section-config",
						"renderedValue": "{'count': 1}",
					},
					{
						"dependencyKey": "section-config.param-count",
						"renderedValue": "1",
					},
				},
			},
			"deltas": []map[string]any{
				{
					"dependency": "section-config.param-count",
					"value": map[string]any{
						"type":    "Literal",
						"payload": "2",
					},
				},
			},
		},
	}); err != nil {
		t.Fatalf("encode local core command: %v", err)
	}

	var output bytes.Buffer
	if err := Run(RunOptions{
		Stdin:  &input,
		Stdout: &output,
	}); err != nil {
		t.Fatalf("Run() error = %v", err)
	}

	decoder := json.NewDecoder(&output)
	var handshake pythonsdkcontracts.LocalCoreVersionHandshake
	if err := decoder.Decode(&handshake); err != nil {
		t.Fatalf("decode handshake: %v", err)
	}
	if handshake.ProtocolVersion != ProtocolVersion {
		t.Fatalf("expected protocol version %d, got %d", ProtocolVersion, handshake.ProtocolVersion)
	}
	if handshake.SDKContractVersion != pythonsdkcontracts.SDKContractVersion {
		t.Fatalf(
			"expected contract version %d, got %d",
			pythonsdkcontracts.SDKContractVersion,
			handshake.SDKContractVersion,
		)
	}

	var result pythonsdkcontracts.LocalCoreResultEnvelope
	if err := decoder.Decode(&result); err != nil {
		t.Fatalf("decode command result: %v", err)
	}
	if !result.OK {
		t.Fatalf("expected ok result, got error %v", result.Error)
	}
	if result.CallID != "call-1" {
		t.Fatalf("expected call id call-1, got %s", result.CallID)
	}
	encodedResult, err := json.Marshal(result.Result)
	if err != nil {
		t.Fatalf("marshal local core result: %v", err)
	}
	var typedResult renderRealtimeDependencyValuesResultWire
	if err := json.Unmarshal(encodedResult, &typedResult); err != nil {
		t.Fatalf("decode typed local core result: %v", err)
	}
	if len(typedResult.DependencyValues.Entries) != 2 {
		t.Fatalf("expected 2 dependency values, got %d", len(typedResult.DependencyValues.Entries))
	}
	if typedResult.DependencyValues.Entries[0].DependencyKey != "section-config" {
		t.Fatalf(
			"expected first dependency key section-config, got %s",
			typedResult.DependencyValues.Entries[0].DependencyKey,
		)
	}
	if typedResult.DependencyValues.Entries[0].RenderedValue != "{'count': 2}" {
		t.Fatalf(
			"expected first dependency value to refresh dependents, got %q",
			typedResult.DependencyValues.Entries[0].RenderedValue,
		)
	}
	if typedResult.DependencyValues.Entries[1].DependencyKey != "section-config.param-count" {
		t.Fatalf(
			"expected second dependency key section-config.param-count, got %s",
			typedResult.DependencyValues.Entries[1].DependencyKey,
		)
	}
}
