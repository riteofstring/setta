package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestMembersFromRootDiscoversMethodsAndParams(t *testing.T) {
	root := jsonSchema{OneOf: []jsonSchema{
		{
			Properties: map[string]jsonSchema{
				"method": {Enum: []string{"thread/goal/set"}, Type: "string"},
				"params": {Ref: "#/definitions/ThreadGoalSetParams"},
			},
		},
		{
			Properties: map[string]jsonSchema{
				"method": {Enum: []string{"model/list"}, Type: "string"},
				"params": {Ref: "#/definitions/ModelListParams"},
			},
		},
	}}

	members, err := membersFromRoot(root, "test")
	if err != nil {
		t.Fatalf("members from root: %v", err)
	}
	if len(members) != 2 {
		t.Fatalf("members = %+v, want two", members)
	}
	if members[0].Method != "model/list" || members[0].ConstName != "ModelList" || members[0].ParamsName != "ModelListParams" {
		t.Fatalf("first member = %+v, want sorted model/list", members[0])
	}
	if members[1].Method != "thread/goal/set" || members[1].ConstName != "ThreadGoalSet" || members[1].ParamsName != "ThreadGoalSetParams" {
		t.Fatalf("second member = %+v, want thread/goal/set", members[1])
	}
}

func TestAddSchemaRejectsConflictingDuplicateName(t *testing.T) {
	generator := &generator{
		schemas:   map[string]jsonSchema{},
		schemaRaw: map[string]string{},
		queue:     []string{},
	}
	if err := generator.addSchema("Example", jsonSchema{Type: "string"}); err != nil {
		t.Fatalf("add first schema: %v", err)
	}

	err := generator.addSchema("Example", jsonSchema{Type: "integer"})
	if err == nil {
		t.Fatal("add conflicting schema succeeded, want error")
	}
	if !strings.Contains(err.Error(), "schema Example has conflicting definitions") {
		t.Fatalf("error = %q, want conflicting definitions", err)
	}
}

func TestAddRootSchemaRejectsConflictingDuplicateName(t *testing.T) {
	generator := &generator{
		rootSchemas:   map[string]jsonSchema{},
		rootSchemaRaw: map[string]string{},
	}
	if err := generator.addRootSchema("Example", jsonSchema{Type: "string"}); err != nil {
		t.Fatalf("add first root schema: %v", err)
	}

	err := generator.addRootSchema("Example", jsonSchema{Type: "integer"})
	if err == nil {
		t.Fatal("add conflicting root schema succeeded, want error")
	}
	if !strings.Contains(err.Error(), "schema Example has conflicting root definitions") {
		t.Fatalf("error = %q, want conflicting root definitions", err)
	}
}

func TestSupportedProtocolRegistrationAddsStructuredExperimentalClientMethod(t *testing.T) {
	generator := testProtocolGenerator(t)
	input := supportedProtocolInput{
		ClientMethods: []supportedClientMethod{
			{Method: "thread/start"},
			{
				Method:     "thread/settings/update",
				ParamsName: "ThreadSettingsUpdateParams",
				Source:     "checked experimental fixture",
			},
		},
		Notifications:            []string{"thread/started"},
		ServerRequests:           []string{"item/tool/call"},
		UnsupportedNotifications: []string{"thread/compacted"},
		Schemas:                  []string{"ExplicitFixture"},
	}

	if err := generator.applySupportedProtocol(input); err != nil {
		t.Fatalf("apply supported protocol: %v", err)
	}
	if err := generator.collectSchemasFromSupported(input); err != nil {
		t.Fatalf("collect schemas: %v", err)
	}

	if _, ok := membersByMethod(generator.clientMethods)["thread/settings/update"]; !ok {
		t.Fatal("experimental method was not added to generated client methods")
	}
	if _, ok := generator.schemas["ThreadSettingsUpdateParams"]; !ok {
		t.Fatal("ThreadSettingsUpdateParams schema was not collected")
	}
	if _, ok := generator.schemas["ExplicitFixture"]; !ok {
		t.Fatal("explicit schema registration was not collected")
	}
}

func TestSupportedProtocolRegistrationRejectsMissingMethod(t *testing.T) {
	generator := testProtocolGenerator(t)
	input := supportedProtocolInput{
		Notifications: []string{"thread/missing"},
	}

	err := generator.applySupportedProtocol(input)
	if err == nil {
		t.Fatal("apply supported protocol succeeded, want missing method error")
	}
	if !strings.Contains(err.Error(), "notification thread/missing is missing from the structured protocol snapshot") {
		t.Fatalf("error = %q, want missing notification", err)
	}
}

func TestSupportedProtocolRegistrationRejectsMissingSchema(t *testing.T) {
	generator := testProtocolGenerator(t)
	input := supportedProtocolInput{
		Schemas: []string{"MissingFixture"},
	}

	err := generator.collectSchemasFromSupported(input)
	if err == nil {
		t.Fatal("collect schemas succeeded, want missing schema error")
	}
	if !strings.Contains(err.Error(), "supported schema MissingFixture: schema MissingFixture was not found in JSON snapshot") {
		t.Fatalf("error = %q, want missing schema", err)
	}
}

func TestSupportedProtocolRegistrationRejectsSupportedDeprecatedNotification(t *testing.T) {
	generator := testProtocolGenerator(t)
	input := supportedProtocolInput{
		Notifications:            []string{"thread/compacted"},
		UnsupportedNotifications: []string{"thread/compacted"},
	}

	err := generator.applySupportedProtocol(input)
	if err == nil {
		t.Fatal("apply supported protocol succeeded, want supported deprecated conflict")
	}
	if !strings.Contains(err.Error(), "notification thread/compacted cannot be both supported and unsupported") {
		t.Fatalf("error = %q, want supported/unsupported conflict", err)
	}
}

func TestRenderEmitsOnlySupportedServerRequestConstants(t *testing.T) {
	generator := testProtocolGenerator(t)
	generator.serverRequests = []protocolMember{
		{Method: "applyPatchApproval", ConstName: "ApplyPatchApproval", ParamsName: "LegacyRequest", Source: "json"},
		{Method: "item/tool/call", ConstName: "ItemToolCall", ParamsName: "ToolCallRequest", Source: "json"},
	}
	generator.supportedServerRequests = []protocolMember{
		{Method: "item/tool/call", ConstName: "ItemToolCall", ParamsName: "ToolCallRequest", Source: "json"},
	}

	output, err := generator.render()
	if err != nil {
		t.Fatalf("render protocol: %v", err)
	}
	text := string(output)
	if !strings.Contains(text, `CodexServerRequestItemToolCall = "item/tool/call"`) {
		t.Fatalf("output = %s, want supported item/tool/call request constant", text)
	}
	if strings.Contains(text, "CodexServerRequestApplyPatchApproval") {
		t.Fatalf("output = %s, want no legacy applyPatchApproval server request constant", text)
	}
}

func testProtocolGenerator(t *testing.T) *generator {
	t.Helper()

	schemaDir := t.TempDir()
	v2Dir := filepath.Join(schemaDir, "v2")
	if err := os.MkdirAll(v2Dir, 0o755); err != nil {
		t.Fatalf("create schema dir: %v", err)
	}
	for name, body := range map[string]string{
		"ExplicitFixture":            `{"title":"ExplicitFixture","type":"object","properties":{"value":{"type":"string"}}}`,
		"ThreadStartedNotification":  `{"title":"ThreadStartedNotification","type":"object","properties":{"threadId":{"type":"string"}}}`,
		"ThreadSettingsUpdateParams": `{"title":"ThreadSettingsUpdateParams","type":"object","properties":{"threadId":{"type":"string"},"model":{"type":["string","null"]}},"required":["threadId"]}`,
		"ToolCallRequest":            `{"title":"ToolCallRequest","type":"object","properties":{"itemId":{"type":"string"}}}`,
	} {
		if err := os.WriteFile(filepath.Join(v2Dir, name+".json"), []byte(body), 0o644); err != nil {
			t.Fatalf("write schema %s: %v", name, err)
		}
	}
	return &generator{
		schemaDir: schemaDir,
		rootSchemas: map[string]jsonSchema{
			"ThreadStartParams": {Type: "object"},
		},
		rootSchemaRaw: map[string]string{},
		clientMethods: []protocolMember{
			{Method: "thread/start", ConstName: "ThreadStart", ParamsName: "ThreadStartParams", Source: "json"},
		},
		notifications: []protocolMember{
			{Method: "thread/compacted", ConstName: "ThreadCompacted", ParamsName: "ThreadCompactedNotification", Source: "json"},
			{Method: "thread/started", ConstName: "ThreadStarted", ParamsName: "ThreadStartedNotification", Source: "json"},
		},
		serverRequests: []protocolMember{
			{Method: "item/tool/call", ConstName: "ItemToolCall", ParamsName: "ToolCallRequest", Source: "json"},
		},
		schemas:   map[string]jsonSchema{},
		schemaRaw: map[string]string{},
		queue:     []string{},
	}
}
