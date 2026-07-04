package main

import (
	"go/ast"
	"go/parser"
	"go/token"
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
				Experimental: true,
				Method:       "thread/settings/update",
				ParamsName:   "ThreadSettingsUpdateParams",
				Source:       "generated experimental fixture",
			},
		},
		Notifications:  []string{"thread/started"},
		ServerRequests: []string{"item/tool/call"},
		Schemas:        []string{"ExplicitFixture"},
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

func TestSupportedProtocolRegistrationUsesExperimentalSchemaForStableClientMethod(t *testing.T) {
	generator := testProtocolGenerator(t)
	input := supportedProtocolInput{
		ClientMethods: []supportedClientMethod{
			{
				Experimental: true,
				Method:       "thread/start",
				ParamsName:   "ThreadStartParams",
				Source:       "generated experimental fixture",
			},
		},
	}

	if err := generator.applySupportedProtocol(input); err != nil {
		t.Fatalf("apply supported protocol: %v", err)
	}
	if err := generator.collectSchemasFromSupported(input); err != nil {
		t.Fatalf("collect schemas: %v", err)
	}

	member, ok := membersByMethod(generator.supportedClientMethods)["thread/start"]
	if !ok {
		t.Fatal("thread/start was not registered as supported")
	}
	if !member.Experimental {
		t.Fatalf("thread/start member = %+v, want experimental schema override", member)
	}
	params := generator.schemas["ThreadStartParams"]
	if _, ok := params.Properties["permissions"]; !ok {
		t.Fatalf("ThreadStartParams properties = %+v, want permissions from experimental schema", params.Properties)
	}
	response := generator.schemas["ThreadStartResponse"]
	if _, ok := response.Properties["activePermissionProfile"]; !ok {
		t.Fatalf("ThreadStartResponse properties = %+v, want activePermissionProfile from experimental schema", response.Properties)
	}
}

func TestSupportedProtocolRegistrationRejectsUnclassifiedCustomClientMethod(t *testing.T) {
	generator := testProtocolGenerator(t)
	input := supportedProtocolInput{
		ClientMethods: []supportedClientMethod{
			{
				Method:     "thread/settings/update",
				ParamsName: "ThreadSettingsUpdateParams",
				Source:     "generated experimental fixture",
			},
		},
	}

	err := generator.applySupportedProtocol(input)
	if err == nil {
		t.Fatal("apply supported protocol succeeded, want unclassified custom method error")
	}
	if !strings.Contains(err.Error(), "client method thread/settings/update is not in the stable structured protocol snapshot and must be registered as experimental") {
		t.Fatalf("error = %q, want experimental classification", err)
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

func TestRenderEmitsOnlyRegisteredCodexProtocolConstants(t *testing.T) {
	generator := testProtocolGenerator(t)
	generator.clientMethods = []protocolMember{
		{Method: "thread/list", ConstName: "ThreadList", ParamsName: "ThreadListParams", Source: "json"},
		{Method: "turn/start", ConstName: "TurnStart", ParamsName: "TurnStartParams", Source: "json"},
	}
	generator.supportedClientMethods = []protocolMember{
		{Method: "turn/start", ConstName: "TurnStart", ParamsName: "TurnStartParams", Source: "json"},
	}
	generator.notifications = []protocolMember{
		{Method: "item/fileChange/outputDelta", ConstName: "ItemFileChangeOutputDelta", ParamsName: "FileChangeOutputDeltaNotification", Source: "json"},
		{Method: "thread/started", ConstName: "ThreadStarted", ParamsName: "ThreadStartedNotification", Source: "json"},
	}
	generator.supportedNotifications = []protocolMember{
		{Method: "thread/started", ConstName: "ThreadStarted", ParamsName: "ThreadStartedNotification", Source: "json"},
	}

	output, err := generator.render()
	if err != nil {
		t.Fatalf("render protocol: %v", err)
	}
	text := string(output)
	if !strings.Contains(text, `CodexMethodTurnStart = "turn/start"`) {
		t.Fatalf("output = %s, want supported turn/start method constant", text)
	}
	if strings.Contains(text, "CodexMethodThreadList") {
		t.Fatalf("output = %s, want no unsupported thread/list method constant", text)
	}
	if strings.Contains(text, "CodexNotificationItemFileChangeOutputDelta") {
		t.Fatalf("output = %s, want no unsupported notification constant", text)
	}
	if strings.Contains(text, "CodexNotificationValues") {
		t.Fatalf("output = %s, want no all-notifications value list", text)
	}
}

func TestRenderFiltersDeprecatedStringEnumValuesFromGeneratedSurface(t *testing.T) {
	generator := testProtocolGenerator(t)
	generator.schemas = map[string]jsonSchema{
		"ApprovalsReviewer": {
			Enum: []string{"user", "auto_review", "guardian_subagent"},
			Type: "string",
		},
	}

	output, err := generator.render()
	if err != nil {
		t.Fatalf("render protocol: %v", err)
	}
	text := string(output)
	if !strings.Contains(text, `ApprovalsReviewerUser`) ||
		!strings.Contains(text, `ApprovalsReviewer = "user"`) {
		t.Fatalf("output = %s, want user reviewer constant", text)
	}
	if !strings.Contains(text, `ApprovalsReviewerAutoReview`) ||
		!strings.Contains(text, `ApprovalsReviewer = "auto_review"`) {
		t.Fatalf("output = %s, want auto_review reviewer constant", text)
	}
	if strings.Contains(text, "guardian_subagent") {
		t.Fatalf("output = %s, want no deprecated guardian_subagent reviewer constant", text)
	}
}

func TestRenderEmitsObjectDecoderDeclarations(t *testing.T) {
	generator := testProtocolGenerator(t)
	generator.schemas = map[string]jsonSchema{
		"ThreadSettingsUpdateParams": {
			Type: "object",
			Properties: map[string]jsonSchema{
				"model":    {Type: []any{"string", "null"}},
				"threadId": {Type: "string"},
			},
			Required: []string{"threadId"},
		},
	}

	output, err := generator.render()
	if err != nil {
		t.Fatalf("render protocol: %v", err)
	}
	file, err := parser.ParseFile(token.NewFileSet(), "protocol_gen.go", output, 0)
	if err != nil {
		t.Fatalf("parse generated protocol: %v\n%s", err, output)
	}
	for _, name := range []string{
		"ThreadSettingsUpdateParams",
		"validateThreadSettingsUpdateParams",
		"DecodeThreadSettingsUpdateParams",
	} {
		if !hasTopLevelDeclaration(file, name) {
			t.Fatalf("generated protocol is missing declaration %s", name)
		}
	}
}

func TestRenderPreservesThreadSettingsServiceTierNullSemantics(t *testing.T) {
	generator := testProtocolGenerator(t)
	generator.schemas = map[string]jsonSchema{
		"ThreadSettingsUpdateParams": {
			Type: "object",
			Properties: map[string]jsonSchema{
				"serviceTier": {Type: []any{"string", "null"}},
				"threadId":    {Type: "string"},
			},
			Required: []string{"threadId"},
		},
	}

	output, err := generator.render()
	if err != nil {
		t.Fatalf("render protocol: %v", err)
	}
	if !strings.Contains(string(output), "ServiceTier *CodexNullableString `json:\"serviceTier,omitempty\"`") {
		t.Fatalf("output = %s, want nullable serviceTier override", output)
	}
}

func TestRenderEmitsNestedObjectValidation(t *testing.T) {
	generator := testProtocolGenerator(t)
	generator.schemas = map[string]jsonSchema{
		"Child": {
			Type: "object",
			Properties: map[string]jsonSchema{
				"name": {Type: "string"},
			},
			Required: []string{"name"},
		},
		"Parent": {
			Type: "object",
			Properties: map[string]jsonSchema{
				"child":    {Ref: "#/definitions/Child"},
				"children": {Type: "array", Items: &jsonSchema{Ref: "#/definitions/Child"}},
			},
			Required: []string{"child", "children"},
		},
	}

	output, err := generator.render()
	if err != nil {
		t.Fatalf("render protocol: %v", err)
	}
	text := string(output)
	if !strings.Contains(text, `validateCodexObjectField(fields, "child", name+".child", false, validateChild)`) {
		t.Fatalf("output = %s, want nested object validation", text)
	}
	if !strings.Contains(text, `validateCodexObjectArrayField(fields, "children", name+".children", false, false, validateChild)`) {
		t.Fatalf("output = %s, want nested object array validation", text)
	}
}

func hasTopLevelDeclaration(file *ast.File, name string) bool {
	for _, declaration := range file.Decls {
		switch declaration := declaration.(type) {
		case *ast.FuncDecl:
			if declaration.Name.Name == name {
				return true
			}
		case *ast.GenDecl:
			for _, spec := range declaration.Specs {
				typeSpec, ok := spec.(*ast.TypeSpec)
				if ok && typeSpec.Name.Name == name {
					return true
				}
			}
		}
	}
	return false
}

func testProtocolGenerator(t *testing.T) *generator {
	t.Helper()

	schemaDir := t.TempDir()
	experimentalSchemaDir := t.TempDir()
	v2Dir := filepath.Join(schemaDir, "v2")
	experimentalV2Dir := filepath.Join(experimentalSchemaDir, "v2")
	if err := os.MkdirAll(v2Dir, 0o755); err != nil {
		t.Fatalf("create schema dir: %v", err)
	}
	if err := os.MkdirAll(experimentalV2Dir, 0o755); err != nil {
		t.Fatalf("create experimental schema dir: %v", err)
	}
	for name, body := range map[string]string{
		"ExplicitFixture":           `{"title":"ExplicitFixture","type":"object","properties":{"value":{"type":"string"}}}`,
		"ThreadStartedNotification": `{"title":"ThreadStartedNotification","type":"object","properties":{"threadId":{"type":"string"}}}`,
		"ToolCallRequest":           `{"title":"ToolCallRequest","type":"object","properties":{"itemId":{"type":"string"}}}`,
	} {
		if err := os.WriteFile(filepath.Join(v2Dir, name+".json"), []byte(body), 0o644); err != nil {
			t.Fatalf("write schema %s: %v", name, err)
		}
	}
	if err := os.WriteFile(
		filepath.Join(experimentalV2Dir, "ThreadSettingsUpdateParams.json"),
		[]byte(`{"title":"ThreadSettingsUpdateParams","type":"object","properties":{"threadId":{"type":"string"},"model":{"type":["string","null"]},"serviceTier":{"type":["string","null"]}},"required":["threadId"]}`),
		0o644,
	); err != nil {
		t.Fatalf("write experimental ThreadSettingsUpdateParams schema: %v", err)
	}
	if err := os.WriteFile(
		filepath.Join(experimentalV2Dir, "ThreadStartParams.json"),
		[]byte(`{"title":"ThreadStartParams","type":"object","properties":{"model":{"type":["string","null"]},"permissions":{"type":["string","null"]}}}`),
		0o644,
	); err != nil {
		t.Fatalf("write experimental ThreadStartParams schema: %v", err)
	}
	if err := os.WriteFile(
		filepath.Join(experimentalV2Dir, "ThreadStartResponse.json"),
		[]byte(`{"title":"ThreadStartResponse","type":"object","properties":{"model":{"type":"string"},"activePermissionProfile":{"type":["object","null"]}},"required":["model"]}`),
		0o644,
	); err != nil {
		t.Fatalf("write experimental ThreadStartResponse schema: %v", err)
	}
	return &generator{
		schemaDir:             schemaDir,
		experimentalSchemaDir: experimentalSchemaDir,
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
