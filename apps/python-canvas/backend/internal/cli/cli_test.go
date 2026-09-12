package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/setta/python-canvas/backend/internal/contracts"
)

func TestSchemaPublishesTheClosedOperationRegistry(t *testing.T) {
	exitCode, stdout, stderr := runForTest(t, []string{"schema"}, "", nil)
	if exitCode != exitSuccess {
		t.Fatalf("schema exit code = %d, want %d; stderr = %s", exitCode, exitSuccess, stderr)
	}
	if stderr != "" {
		t.Fatalf("schema stderr = %q, want empty", stderr)
	}
	var document schemaDocument
	if err := json.Unmarshal([]byte(stdout), &document); err != nil {
		t.Fatalf("decode schema output: %v", err)
	}
	assertSchemaVersion(t, document)
	assertCommandSchemas(t, document.Commands)
	assertOperationSchemas(t, document.Operations)
	assertResultSchemas(t, document.Results)
	assertErrorSchemas(t, document.Errors)
	assertParameterUIVocabulary(t, document.V2Vocabulary)
}

func assertSchemaVersion(t *testing.T, document schemaDocument) {
	t.Helper()
	if document.Version != cliContractVersion {
		t.Fatalf("schema version = %q, want %q", document.Version, cliContractVersion)
	}
}

func assertOperationSchemas(t *testing.T, operations []operationSchema) {
	t.Helper()
	want := []string{
		"project.rename",
		"callable.create", "callable.createConfigured", "callable.rename", "callable.delete", "callable.commit", "callable.parameters.refresh", "callable.parameters.set",
		"parameterDictionary.create", "parameterDictionary.rename", "parameterDictionary.delete", "parameterDictionary.entries.set",
		"list.create", "list.rename", "list.delete", "list.children.increment", "list.children.decrement",
		"forest.replace", "pythonTarget.set",
	}
	if len(operations) != len(want) {
		t.Fatalf("schema operation count = %d, want %d", len(operations), len(want))
	}
	for index, operation := range operations {
		assertOperationSchema(t, index, operation, want[index])
	}
}

func assertCommandSchemas(t *testing.T, commands []commandSchema) {
	t.Helper()
	want := []string{"schema", "open", "session.inspect", "snapshot", "apply", "run", "export-bench"}
	if len(commands) != len(want) {
		t.Fatalf("schema command count = %d, want %d", len(commands), len(want))
	}
	for index, name := range want {
		command := commands[index]
		if command.Name != name || command.Usage == "" || command.Summary == "" || command.Result == "" {
			t.Fatalf("schema command %d = %#v", index, command)
		}
		if (name == "snapshot" || name == "apply" || name == "run" || name == "export-bench") && len(command.Selectors) != 2 {
			t.Fatalf("schema command %q selectors = %#v", name, command.Selectors)
		}
		if name == "run" {
			if !containsExitCode(command.ExitCodes, exitCompletedPythonFailure) || !containsString(fieldNames(command.Options), "--run-timeout") {
				t.Fatalf("run schema = %#v", command)
			}
		}
	}
}

func assertResultSchemas(t *testing.T, results []resultSchema) {
	t.Helper()
	runResult := findResult(results, "GeneratedProgramRunResultV2")
	if runResult == nil {
		t.Fatal("schema does not publish the generated-program run result")
	}
	for _, field := range []string{"projectId", "revision", "stdout", "stderr", "stdoutTruncated", "stderrTruncated", "exitCode", "terminationReason", "elapsedMilliseconds"} {
		if !containsString(fieldNames(runResult.Fields), field) {
			t.Fatalf("run result schema fields = %#v, want %q", runResult.Fields, field)
		}
	}
}

func assertErrorSchemas(t *testing.T, values []errorSchema) {
	t.Helper()
	for _, code := range []string{"invalid_input", string(contracts.APIErrorCodeRunnerUnavailableV2), string(contracts.APIErrorCodeRunnerFailedV2), "connection_failed"} {
		found := false
		for _, value := range values {
			if value.Code == code {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("schema errors do not publish %q: %#v", code, values)
		}
	}
}

func fieldNames(fields []fieldSchema) []string {
	values := make([]string, 0, len(fields))
	for _, field := range fields {
		values = append(values, field.Name)
	}
	return values
}

func findResult(results []resultSchema, name string) *resultSchema {
	for index := range results {
		if results[index].Name == name {
			return &results[index]
		}
	}
	return nil
}

func containsExitCode(values []exitCodeSchema, want int) bool {
	for _, value := range values {
		if value.Code == want {
			return true
		}
	}
	return false
}

func assertOperationSchema(t *testing.T, index int, operation operationSchema, wantName string) {
	t.Helper()
	if operation.Name != wantName {
		t.Fatalf("schema operation %d = %q, want %q", index, operation.Name, wantName)
	}
	if !containsString(operation.Required, "operation") {
		t.Fatalf("schema %q does not require operation", operation.Name)
	}
	assertOperationHidesTransportFields(t, operation)
	if !json.Valid(operation.Example) {
		t.Fatalf("schema %q example is invalid JSON: %s", operation.Name, operation.Example)
	}
	assertCallableCommitExample(t, operation)
	if operation.Name == "callable.createConfigured" && !containsString(operation.Optional, "parameterValues") {
		t.Fatalf("configured callable schema optional fields = %#v, want parameterValues", operation.Optional)
	}
}

func assertOperationHidesTransportFields(t *testing.T, operation operationSchema) {
	t.Helper()
	for _, forbidden := range []string{"projectId", "expectedRevision"} {
		if containsString(operation.Required, forbidden) || containsString(operation.Optional, forbidden) {
			t.Fatalf("schema %q exposes transport field %q", operation.Name, forbidden)
		}
	}
}

func assertCallableCommitExample(t *testing.T, operation operationSchema) {
	t.Helper()
	if operation.Name != "callable.commit" {
		return
	}
	var example struct {
		AuthoredExpression string `json:"authoredExpression"`
	}
	if err := json.Unmarshal(operation.Example, &example); err != nil {
		t.Fatalf("decode callable.commit example: %v", err)
	}
	if example.AuthoredExpression != "math.sqrt" {
		t.Fatalf("callable.commit expression example = %q, want callable reference", example.AuthoredExpression)
	}
}

func assertParameterUIVocabulary(t *testing.T, vocabulary []vocabularyShape) {
	t.Helper()
	if len(vocabulary) < 4 {
		t.Fatalf("schema V2 vocabulary = %#v", vocabulary)
	}
	parameterUIVocabulary := findVocabulary(vocabulary, "ParameterUIV2")
	if parameterUIVocabulary == nil {
		t.Fatal("schema does not publish ParameterUIV2 vocabulary")
	}
	uiTypes := contracts.ParameterUITypesV2()
	if len(parameterUIVocabulary.DefaultExamples) != len(uiTypes) {
		t.Fatalf("ParameterUIV2 default examples = %d, want %d", len(parameterUIVocabulary.DefaultExamples), len(uiTypes))
	}
	for index, example := range parameterUIVocabulary.DefaultExamples {
		assertParameterUIDefaultExample(t, index, example, uiTypes[index])
	}
}

func findVocabulary(vocabulary []vocabularyShape, name string) *vocabularyShape {
	for index := range vocabulary {
		if vocabulary[index].Name == name {
			return &vocabulary[index]
		}
	}
	return nil
}

func assertParameterUIDefaultExample(t *testing.T, index int, example contracts.ParameterUIV2, uiType contracts.ParameterUITypeV2) {
	t.Helper()
	if example.Type != uiType {
		t.Fatalf("ParameterUIV2 default example %d type = %q, want %q", index, example.Type, uiType)
	}
	if _, err := example.Aggregate(); err != nil {
		t.Fatalf("ParameterUIV2 default example %q does not aggregate: %v", example.Type, err)
	}
	want, err := contracts.DefaultParameterUIV2(uiType)
	if err != nil {
		t.Fatalf("build authoritative default %q: %v", uiType, err)
	}
	if !reflect.DeepEqual(example, want) {
		t.Fatalf("ParameterUIV2 default example %q = %#v, want %#v", example.Type, example, want)
	}
}

func TestOperationRegistryBindsEveryAuthoredMutation(t *testing.T) {
	snapshot := contracts.FixtureProjectSnapshotV2()
	snapshot.Project.ID = "project:cli"
	snapshot.Project.Revision = 7
	snapshot.DiagnosticsRevision = 7
	wantRoutes := map[string]string{
		"project.rename":                  contracts.ProjectRenamePathV2,
		"callable.create":                 contracts.ProjectCallablesPathV2,
		"callable.createConfigured":       contracts.ProjectConfiguredCallablePathV2,
		"callable.rename":                 contracts.ProjectCallablesPathV2 + "/" + url.PathEscape("callable:example") + "/rename",
		"callable.delete":                 contracts.ProjectCallablesPathV2 + "/" + url.PathEscape("callable:example") + "/delete",
		"callable.commit":                 contracts.ProjectCallablesPathV2 + "/" + url.PathEscape("callable:example") + "/commit",
		"callable.parameters.refresh":     contracts.ProjectCallablesPathV2 + "/" + url.PathEscape("callable:example") + "/refresh-parameters",
		"callable.parameters.set":         contracts.ProjectCallablesPathV2 + "/" + url.PathEscape("callable:example") + "/parameters",
		"parameterDictionary.create":      contracts.ProjectParameterDictionariesPathV2,
		"parameterDictionary.rename":      contracts.ProjectParameterDictionariesPathV2 + "/" + url.PathEscape("dictionary:example") + "/rename",
		"parameterDictionary.delete":      contracts.ProjectParameterDictionariesPathV2 + "/" + url.PathEscape("dictionary:example") + "/delete",
		"parameterDictionary.entries.set": contracts.ProjectParameterDictionariesPathV2 + "/" + url.PathEscape("dictionary:example") + "/entries",
		"list.create":                     contracts.ProjectListsPathV2,
		"list.rename":                     contracts.ProjectListsPathV2 + "/" + url.PathEscape("list:example") + "/rename",
		"list.delete":                     contracts.ProjectListsPathV2 + "/" + url.PathEscape("list:example") + "/delete",
		"list.children.increment":         contracts.ProjectListsPathV2 + "/" + url.PathEscape("list:example") + "/increment",
		"list.children.decrement":         contracts.ProjectListsPathV2 + "/" + url.PathEscape("list:example") + "/decrement",
		"forest.replace":                  contracts.ProjectForestPathV2,
		"pythonTarget.set":                contracts.ProjectTargetPathV2,
	}
	for _, definition := range operationRegistry {
		t.Run(definition.name, func(t *testing.T) {
			decoded, err := decodeOperationDocument(definition.example)
			if err != nil {
				t.Fatalf("decode example: %v", err)
			}
			request, err := decoded.mutation(snapshot)
			if err != nil {
				t.Fatalf("bind operation: %v", err)
			}
			if request.path != wantRoutes[definition.name] {
				t.Fatalf("route = %q, want %q", request.path, wantRoutes[definition.name])
			}
			body, err := json.Marshal(request.body)
			if err != nil {
				t.Fatalf("marshal V2 request: %v", err)
			}
			var actual map[string]any
			if err := json.Unmarshal(body, &actual); err != nil {
				t.Fatalf("decode V2 request: %v", err)
			}
			var expected map[string]any
			if err := json.Unmarshal(definition.example, &expected); err != nil {
				t.Fatalf("decode operation example: %v", err)
			}
			delete(expected, "operation")
			delete(expected, "callableId")
			delete(expected, "dictionaryId")
			delete(expected, "listId")
			expected["projectId"] = snapshot.Project.ID
			expected["expectedRevision"] = float64(snapshot.Project.Revision)
			if !reflect.DeepEqual(actual, expected) {
				t.Fatalf("V2 request body = %#v, want %#v", actual, expected)
			}
		})
	}

	decoded, err := decodeOperationDocument([]byte(`{"operation":"callable.rename","callableId":"callable:one/two","name":"sqrt"}`))
	if err != nil {
		t.Fatalf("decode slash ID operation: %v", err)
	}
	request, err := decoded.mutation(snapshot)
	if err != nil {
		t.Fatalf("bind slash ID operation: %v", err)
	}
	if request.path != contracts.ProjectCallablesPathV2+"/"+url.PathEscape("callable:one/two")+"/rename" {
		t.Fatalf("escaped callable route = %q", request.path)
	}
}

func TestApplyFetchesBindsAndReturnsTheCanonicalSnapshot(t *testing.T) {
	before := snapshotAtRevision(3)
	after := snapshotAtRevision(4)
	var getCalls, postCalls int
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		switch {
		case request.Method == http.MethodGet && request.URL.Path == contracts.ProjectPathV2:
			getCalls++
			writeJSONResponse(t, response, before)
		case request.Method == http.MethodPost && request.URL.Path == contracts.ProjectRenamePathV2:
			postCalls++
			var body contracts.RenameProjectRequestV2
			if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
				t.Errorf("decode mutation body: %v", err)
				return
			}
			if body != (contracts.RenameProjectRequestV2{ProjectID: before.Project.ID, ExpectedRevision: before.Project.Revision, Name: "CLI rename"}) {
				t.Errorf("mutation body = %#v", body)
				return
			}
			writeJSONResponse(t, response, after)
		default:
			t.Errorf("unexpected request %s %s", request.Method, request.URL.Path)
			response.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()

	exitCode, stdout, stderr := runForTest(t, []string{"apply", "--url", server.URL, "--file", "-"}, `{"operation":"project.rename","name":"CLI rename"}`, server.Client())
	if exitCode != exitSuccess {
		t.Fatalf("apply exit code = %d, stderr = %s", exitCode, stderr)
	}
	if stderr != "" {
		t.Fatalf("apply stderr = %q, want empty", stderr)
	}
	if getCalls != 1 || postCalls != 1 {
		t.Fatalf("requests = GET %d POST %d, want one each", getCalls, postCalls)
	}
	var result contracts.ProjectSnapshotV2
	if err := json.Unmarshal([]byte(stdout), &result); err != nil {
		t.Fatalf("decode apply stdout: %v", err)
	}
	if err := result.Validate(); err != nil {
		t.Fatalf("apply result is not canonical snapshot: %v", err)
	}
	if result.Project.Revision != after.Project.Revision {
		t.Fatalf("apply output revision = %d, want %d", result.Project.Revision, after.Project.Revision)
	}
}

func TestApplyConfiguredCallableUsesOneMutationAndReturnsTheCanonicalSnapshot(t *testing.T) {
	before := snapshotAtRevision(3)
	after := snapshotAtRevision(4)
	var getCalls, postCalls int
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		switch {
		case request.Method == http.MethodGet && request.URL.Path == contracts.ProjectPathV2:
			getCalls++
			writeJSONResponse(t, response, before)
		case request.Method == http.MethodPost && request.URL.Path == contracts.ProjectConfiguredCallablePathV2:
			postCalls++
			var body contracts.CreateConfiguredCallableRequestV2
			if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
				t.Errorf("decode mutation body: %v", err)
				return
			}
			if body.ProjectID != before.Project.ID || body.ExpectedRevision != before.Project.Revision || body.Name != "Ceiling" || body.AuthoredExpression != "math.ceil" || len(body.ParameterValues) != 1 || body.ParameterValues["x"] != "7.25" {
				t.Errorf("mutation body = %#v", body)
				return
			}
			writeJSONResponse(t, response, after)
		default:
			t.Errorf("unexpected request %s %s", request.Method, request.URL.Path)
			response.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()

	exitCode, stdout, stderr := runForTest(t, []string{"apply", "--url", server.URL, "--file", "-"}, `{"operation":"callable.createConfigured","name":"Ceiling","authoredExpression":"math.ceil","parameterValues":{"x":"7.25"}}`, server.Client())
	if exitCode != exitSuccess || stderr != "" {
		t.Fatalf("apply exit code = %d, stderr = %s", exitCode, stderr)
	}
	if getCalls != 1 || postCalls != 1 {
		t.Fatalf("requests = GET %d POST %d, want one each", getCalls, postCalls)
	}
	var result contracts.ProjectSnapshotV2
	if err := json.Unmarshal([]byte(stdout), &result); err != nil {
		t.Fatalf("decode apply stdout: %v", err)
	}
	if err := result.Validate(); err != nil || result.Project.Revision != after.Project.Revision {
		t.Fatalf("apply result = %#v, validation error = %v", result, err)
	}
}

func TestConfiguredCallableOperationAllowsOmittedParameterValues(t *testing.T) {
	decoded, err := decodeOperationDocument([]byte(`{"operation":"callable.createConfigured","name":"Ceiling","authoredExpression":"math.ceil"}`))
	if err != nil {
		t.Fatalf("decode configured operation: %v", err)
	}
	request, err := decoded.mutation(snapshotAtRevision(1))
	if err != nil {
		t.Fatalf("bind configured operation: %v", err)
	}
	body, ok := request.body.(contracts.CreateConfiguredCallableRequestV2)
	if !ok || len(body.ParameterValues) != 0 {
		t.Fatalf("configured request body = %#v", request.body)
	}
}

func TestApplyReadsOneOperationFromAFile(t *testing.T) {
	before := snapshotAtRevision(1)
	after := snapshotAtRevision(2)
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Method == http.MethodGet {
			writeJSONResponse(t, response, before)
			return
		}
		if request.Method != http.MethodPost || request.URL.Path != contracts.ProjectCallablesPathV2 {
			t.Errorf("unexpected request %s %s", request.Method, request.URL.Path)
			response.WriteHeader(http.StatusNotFound)
			return
		}
		writeJSONResponse(t, response, after)
	}))
	defer server.Close()

	path := filepath.Join(t.TempDir(), "operation.json")
	if err := os.WriteFile(path, []byte(`{"operation":"callable.create","name":"math.sqrt"}`), 0o600); err != nil {
		t.Fatalf("write operation file: %v", err)
	}
	exitCode, stdout, stderr := runForTest(t, []string{"apply", "--url", server.URL, "--file", path}, "ignored", server.Client())
	if exitCode != exitSuccess || stderr != "" || stdout == "" {
		t.Fatalf("file apply = exit %d stdout %q stderr %q", exitCode, stdout, stderr)
	}
}

func TestApplyEscapesDynamicRouteIDsAsOnePathSegment(t *testing.T) {
	before := snapshotAtRevision(1)
	after := snapshotAtRevision(2)
	wantPath := contracts.ProjectCallablesPathV2 + "/" + url.PathEscape("callable:one/two") + "/delete"
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Method == http.MethodGet {
			writeJSONResponse(t, response, before)
			return
		}
		if request.Method != http.MethodPost || request.URL.EscapedPath() != wantPath {
			t.Errorf("request = %s %s, want POST %s", request.Method, request.URL.EscapedPath(), wantPath)
			response.WriteHeader(http.StatusNotFound)
			return
		}
		writeJSONResponse(t, response, after)
	}))
	defer server.Close()

	exitCode, stdout, stderr := runForTest(t, []string{"apply", "--url", server.URL, "--file", "-"}, `{"operation":"callable.delete","callableId":"callable:one/two"}`, server.Client())
	if exitCode != exitSuccess || stderr != "" || stdout == "" {
		t.Fatalf("escaped route apply = exit %d stdout %q stderr %q", exitCode, stdout, stderr)
	}
}

func TestApplyRejectsInvalidOperationBeforeMutation(t *testing.T) {
	for _, test := range []struct {
		name           string
		document       string
		wantCode       string
		messageSnippet string
	}{
		{
			name:           "unknown field",
			document:       `{"operation":"project.rename","name":"Rename","extra":true}`,
			wantCode:       "invalid_operation",
			messageSnippet: `unknown field "extra"`,
		},
		{
			name:           "missing field",
			document:       `{"operation":"project.rename"}`,
			wantCode:       "invalid_operation",
			messageSnippet: `missing field "name"`,
		},
		{
			name:           "unknown operation",
			document:       `{"operation":"missing.operation"}`,
			wantCode:       "unknown_operation",
			messageSnippet: "operation name is not supported",
		},
		{
			name:           "multiple documents",
			document:       `{"operation":"project.rename","name":"Rename"}{"operation":"project.rename","name":"Again"}`,
			wantCode:       "invalid_operation",
			messageSnippet: "exactly one JSON value",
		},
		{
			name:           "invalid ID",
			document:       `{"operation":"callable.delete","callableId":""}`,
			wantCode:       "invalid_operation",
			messageSnippet: "stable ID is invalid",
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			client := &recordingClient{}
			exitCode, stdout, stderr := runForTest(t, []string{"apply", "--file", "-"}, test.document, client)
			if exitCode != exitInputOrTypedV2Failure {
				t.Fatalf("exit code = %d, want %d", exitCode, exitInputOrTypedV2Failure)
			}
			if stdout != "" {
				t.Fatalf("stdout = %q, want empty", stdout)
			}
			if len(client.requests) != 0 {
				t.Fatalf("invalid operation made %d requests", len(client.requests))
			}
			if detail := decodeError(t, stderr); detail.Code != test.wantCode || !strings.Contains(detail.Message, test.messageSnippet) {
				t.Fatalf("error detail = %#v, want code %q and message containing %q", detail, test.wantCode, test.messageSnippet)
			}
		})
	}
}

func TestRunCapturesSnapshotRevisionPublishesCompletedFailureAndUsesExitThree(t *testing.T) {
	snapshot := snapshotAtRevision(3)
	var snapshotCalls, runCalls int
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		switch {
		case request.Method == http.MethodGet && request.URL.Path == contracts.ProjectPathV2:
			snapshotCalls++
			writeJSONResponse(t, response, snapshot)
		case request.Method == http.MethodPost && request.URL.Path == contracts.ProjectRunPathV2:
			runCalls++
			var body contracts.RunGeneratedProgramRequestV2
			if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
				t.Errorf("decode run request: %v", err)
				return
			}
			if body.ProjectID != snapshot.Project.ID || body.ExpectedRevision != snapshot.Project.Revision || body.RunTimeoutMilliseconds == nil || *body.RunTimeoutMilliseconds != 125 {
				t.Errorf("run request = %#v", body)
				return
			}
			exitCode := 7
			writeJSONResponse(t, response, contracts.GeneratedProgramRunResultV2{
				ProjectID:     snapshot.Project.ID,
				Revision:      snapshot.Project.Revision,
				Stdout:        "stdout marker\n",
				Stderr:        "stderr marker\n",
				ExitCode:      &exitCode,
				Termination:   contracts.GeneratedProgramTerminationExitedV2,
				ElapsedMillis: 17,
			})
		default:
			t.Errorf("unexpected request %s %s", request.Method, request.URL.Path)
			response.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()

	exitCode, stdout, stderr := runForTest(t, []string{"run", "--url", server.URL, "--run-timeout", "125ms"}, "", server.Client())
	if exitCode != exitCompletedPythonFailure || stderr != "" {
		t.Fatalf("run exit = %d stderr = %q", exitCode, stderr)
	}
	if snapshotCalls != 1 || runCalls != 1 {
		t.Fatalf("requests = snapshot %d run %d", snapshotCalls, runCalls)
	}
	var result contracts.GeneratedProgramRunResultV2
	if err := json.Unmarshal([]byte(stdout), &result); err != nil {
		t.Fatalf("decode run output: %v", err)
	}
	if err := result.Validate(); err != nil || result.ExitCode == nil || *result.ExitCode != 7 {
		t.Fatalf("run output = %#v, validation error = %v", result, err)
	}
}

func TestRunReturnsExitZeroForPythonSuccessAndThreeForEnforcedTermination(t *testing.T) {
	for _, test := range []struct {
		name        string
		termination contracts.GeneratedProgramTerminationReasonV2
		exitCode    *int
		wantExit    int
	}{
		{
			name:        "success",
			termination: contracts.GeneratedProgramTerminationExitedV2,
			exitCode:    integerPointerForCLITest(0),
			wantExit:    exitSuccess,
		},
		{
			name:        "timed out",
			termination: contracts.GeneratedProgramTerminationTimedOutV2,
			wantExit:    exitCompletedPythonFailure,
		},
		{
			name:        "output limit",
			termination: contracts.GeneratedProgramTerminationOutputLimitV2,
			wantExit:    exitCompletedPythonFailure,
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			snapshot := snapshotAtRevision(2)
			server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
				if request.Method == http.MethodGet && request.URL.Path == contracts.ProjectPathV2 {
					writeJSONResponse(t, response, snapshot)
					return
				}
				if request.Method == http.MethodPost && request.URL.Path == contracts.ProjectRunPathV2 {
					var body contracts.RunGeneratedProgramRequestV2
					if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
						t.Errorf("decode default run request: %v", err)
						return
					}
					if body.RunTimeoutMilliseconds == nil || *body.RunTimeoutMilliseconds != 30000 {
						t.Errorf("default run request = %#v", body)
						return
					}
					writeJSONResponse(t, response, contracts.GeneratedProgramRunResultV2{
						ProjectID:     snapshot.Project.ID,
						Revision:      snapshot.Project.Revision,
						ExitCode:      test.exitCode,
						Termination:   test.termination,
						ElapsedMillis: 1,
					})
					return
				}
				response.WriteHeader(http.StatusNotFound)
			}))
			defer server.Close()

			exitCode, stdout, stderr := runForTest(t, []string{"run", "--url", server.URL}, "", server.Client())
			if exitCode != test.wantExit || stderr != "" || stdout == "" {
				t.Fatalf("run result = exit %d stdout %q stderr %q", exitCode, stdout, stderr)
			}
		})
	}
}

func TestRunRejectsOutOfRangeTimeoutsAndInvalidDiagnosticFlagsBeforeContactingTheService(t *testing.T) {
	for _, arguments := range [][]string{
		{"run", "--run-timeout", "0s"},
		{"run", "--run-timeout", "300001ms"},
		{"run", "--run-timeout="},
		{"run", "--diagnostics-timeout", "1s"},
		{"run", "--wait-diagnostics", "--diagnostics-timeout="},
	} {
		client := &recordingClient{}
		exitCode, stdout, stderr := runForTest(t, arguments, "", client)
		if exitCode != exitInputOrTypedV2Failure || stdout != "" || len(client.requests) != 0 {
			t.Fatalf("arguments %q = exit %d stdout %q requests %d", arguments, exitCode, stdout, len(client.requests))
		}
		if detail := decodeError(t, stderr); detail.Code != "invalid_input" {
			t.Fatalf("arguments %q error = %#v", arguments, detail)
		}
	}
}

func TestRunPreservesTypedRunnerFailure(t *testing.T) {
	snapshot := snapshotAtRevision(2)
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Method == http.MethodGet && request.URL.Path == contracts.ProjectPathV2 {
			writeJSONResponse(t, response, snapshot)
			return
		}
		if request.Method == http.MethodPost && request.URL.Path == contracts.ProjectRunPathV2 {
			response.WriteHeader(http.StatusInternalServerError)
			writeJSONResponse(t, response, contracts.ErrorResponseV2{Error: contracts.APIErrorV2{
				Code:    contracts.APIErrorCodeRunnerFailedV2,
				Message: "runner artifact cleanup failed",
			}})
			return
		}
		response.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	exitCode, stdout, stderr := runForTest(t, []string{"run", "--url", server.URL}, "", server.Client())
	if exitCode != exitInputOrTypedV2Failure || stdout != "" {
		t.Fatalf("typed run failure = exit %d stdout %q stderr %q", exitCode, stdout, stderr)
	}
	if detail := decodeError(t, stderr); detail.Code != string(contracts.APIErrorCodeRunnerFailedV2) {
		t.Fatalf("typed run failure detail = %#v", detail)
	}
}

func integerPointerForCLITest(value int) *int { return &value }

func TestTimeoutRequiresDiagnosticWaiting(t *testing.T) {
	for _, test := range []struct {
		arguments   []string
		wantMessage string
	}{
		{arguments: []string{"snapshot", "--timeout", "1s"}, wantMessage: "--timeout requires --wait-diagnostics."},
		{arguments: []string{"snapshot", "--timeout="}, wantMessage: "--timeout requires --wait-diagnostics."},
		{arguments: []string{"apply", "--file", "-", "--timeout", "1s"}, wantMessage: "--timeout requires --wait-diagnostics."},
		{arguments: []string{"snapshot", "--wait-diagnostics", "--timeout="}, wantMessage: "Diagnostic timeout must be greater than zero and no more than one minute."},
	} {
		client := &recordingClient{}
		exitCode, stdout, stderr := runForTest(t, test.arguments, `{"operation":"project.rename","name":"ignored"}`, client)
		if exitCode != exitInputOrTypedV2Failure || stdout != "" || len(client.requests) != 0 {
			t.Fatalf("arguments %q = exit %d stdout %q requests %d", test.arguments, exitCode, stdout, len(client.requests))
		}
		detail := decodeError(t, stderr)
		if detail.Code != "invalid_input" || detail.Message != test.wantMessage {
			t.Fatalf("arguments %q error = %#v", test.arguments, detail)
		}
	}
}

func TestApplyRejectsOversizedOperationBeforeContactingTheService(t *testing.T) {
	client := &recordingClient{}
	document := `{"operation":"project.rename","name":"` + strings.Repeat("x", MaxOperationBytes) + `"}`
	exitCode, stdout, stderr := runForTest(t, []string{"apply", "--file", "-"}, document, client)
	if exitCode != exitInputOrTypedV2Failure || stdout != "" || len(client.requests) != 0 {
		t.Fatalf("oversized input = exit %d stdout %q requests %d", exitCode, stdout, len(client.requests))
	}
	if detail := decodeError(t, stderr); detail.Code != "input_too_large" {
		t.Fatalf("oversized input error = %#v", detail)
	}
}

func TestApplyPreservesRevisionConflictWithoutRetry(t *testing.T) {
	before := snapshotAtRevision(3)
	var getCalls, postCalls int
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Method == http.MethodGet {
			getCalls++
			writeJSONResponse(t, response, before)
			return
		}
		postCalls++
		expected, current := 3, 4
		response.WriteHeader(http.StatusConflict)
		writeJSONResponse(t, response, contracts.ErrorResponseV2{Error: contracts.APIErrorV2{
			Code:             contracts.APIErrorCodeRevisionConflictV2,
			Message:          "Project revision changed.",
			ExpectedRevision: &expected,
			CurrentRevision:  &current,
		}})
	}))
	defer server.Close()

	exitCode, stdout, stderr := runForTest(t, []string{"apply", "--url", server.URL, "--file", "-"}, `{"operation":"project.rename","name":"Rename"}`, server.Client())
	if exitCode != exitInputOrTypedV2Failure {
		t.Fatalf("exit code = %d, want %d; stderr = %s", exitCode, exitInputOrTypedV2Failure, stderr)
	}
	if stdout != "" {
		t.Fatalf("stdout = %q, want empty", stdout)
	}
	if getCalls != 1 || postCalls != 1 {
		t.Fatalf("revision conflict requests = GET %d POST %d, want one each", getCalls, postCalls)
	}
	detail := decodeError(t, stderr)
	if detail.Code != string(contracts.APIErrorCodeRevisionConflictV2) || detail.ExpectedRevision == nil || detail.CurrentRevision == nil || *detail.ExpectedRevision != 3 || *detail.CurrentRevision != 4 {
		t.Fatalf("revision conflict detail = %#v", detail)
	}
}

func TestSnapshotDiagnosticsWaitSettlesAndTimesOutWithFacts(t *testing.T) {
	stale := snapshotAtRevision(2)
	stale.DiagnosticsRevision = 1
	stale.ProviderStatus.Status = contracts.ProviderAvailabilityAvailableV2
	stale.ProviderStatus.State = contracts.ProviderLifecycleStatePendingV2
	settled := snapshotAtRevision(2)
	settled.ProviderStatus.Status = contracts.ProviderAvailabilityAvailableV2
	settled.ProviderStatus.State = contracts.ProviderLifecycleStateReadyV2
	var snapshotCalls, eventCalls int
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case contracts.ProjectPathV2:
			snapshotCalls++
			writeJSONResponse(t, response, stale)
		case contracts.ProjectEventsPathV2:
			eventCalls++
			writeSnapshotEvents(t, response, stale, settled)
		default:
			http.NotFound(response, request)
		}
	}))
	defer server.Close()

	exitCode, stdout, stderr := runForTest(t, []string{"snapshot", "--url", server.URL, "--wait-diagnostics", "--timeout", "1s"}, "", server.Client())
	if exitCode != exitSuccess || stderr != "" {
		t.Fatalf("settling snapshot exit %d stderr %q", exitCode, stderr)
	}
	var result contracts.ProjectSnapshotV2
	if err := json.Unmarshal([]byte(stdout), &result); err != nil {
		t.Fatalf("decode settled output: %v", err)
	}
	if !diagnosticsSettled(result) || snapshotCalls != 1 || eventCalls != 1 {
		t.Fatalf("settled output = %#v; snapshot calls = %d event calls = %d", result, snapshotCalls, eventCalls)
	}

	timeoutServer := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case contracts.ProjectPathV2:
			writeJSONResponse(t, response, stale)
		case contracts.ProjectEventsPathV2:
			writeSnapshotEvents(t, response, stale)
			<-request.Context().Done()
		default:
			http.NotFound(response, request)
		}
	}))
	defer timeoutServer.Close()
	exitCode, stdout, stderr = runForTest(t, []string{"snapshot", "--url", timeoutServer.URL, "--wait-diagnostics", "--timeout", "1ms"}, "", timeoutServer.Client())
	if exitCode != exitUnexpectedFailure || stdout != "" {
		t.Fatalf("timeout snapshot exit %d stdout %q stderr %q", exitCode, stdout, stderr)
	}
	detail := decodeError(t, stderr)
	if detail.Code != "diagnostics_timeout" || detail.ProjectRevision == nil || detail.DiagnosticsRevision == nil || *detail.ProjectRevision != stale.Project.Revision || *detail.DiagnosticsRevision != stale.DiagnosticsRevision || detail.ProviderState != string(stale.ProviderStatus.State) {
		t.Fatalf("diagnostic timeout detail = %#v", detail)
	}
}

func writeSnapshotEvents(t *testing.T, response http.ResponseWriter, snapshots ...contracts.ProjectSnapshotV2) {
	t.Helper()
	response.Header().Set("Content-Type", "text/event-stream")
	response.WriteHeader(http.StatusOK)
	for _, snapshot := range snapshots {
		encoded, err := json.Marshal(snapshot)
		if err != nil {
			t.Fatalf("encode event snapshot: %v", err)
		}
		if _, err := fmt.Fprintf(response, "data: %s\n\n", encoded); err != nil {
			t.Fatalf("write event snapshot: %v", err)
		}
	}
	if flusher, ok := response.(http.Flusher); ok {
		flusher.Flush()
	}
}

func TestURLValidationAndMalformedResponsesStayMachineReadable(t *testing.T) {
	for _, value := range []string{"http://localhost", "http://127.1.2.3:8080", "http://[::1]:8080"} {
		if _, err := validateServiceURL(value); err != nil {
			t.Fatalf("valid loopback URL %q: %v", value, err)
		}
	}
	for _, value := range []string{
		"https://127.0.0.1:8080",
		"http://example.com",
		"http://127.0.0.1:8080/base",
		"http://127.0.0.1:8080?x=1",
		"http://user@127.0.0.1:8080",
		"http://127.0.0.1:8080#fragment",
	} {
		client := &recordingClient{}
		exitCode, stdout, stderr := runForTest(t, []string{"snapshot", "--url", value}, "", client)
		if exitCode != exitInputOrTypedV2Failure || stdout != "" || len(client.requests) != 0 {
			t.Fatalf("URL %q result: exit %d stdout %q requests %d", value, exitCode, stdout, len(client.requests))
		}
		if detail := decodeError(t, stderr); detail.Code != "invalid_url" {
			t.Fatalf("URL %q error = %#v", value, detail)
		}
	}

	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(response, `{"not":"a snapshot"}`)
	}))
	defer server.Close()
	exitCode, stdout, stderr := runForTest(t, []string{"snapshot", "--url", server.URL}, "", server.Client())
	if exitCode != exitUnexpectedFailure || stdout != "" {
		t.Fatalf("malformed snapshot exit %d stdout %q stderr %q", exitCode, stdout, stderr)
	}
	if detail := decodeError(t, stderr); detail.Code != "malformed_response" {
		t.Fatalf("malformed response error = %#v", detail)
	}
}

func TestPrettyChangesOnlyJSONIndentationAndHelpStaysHumanReadable(t *testing.T) {
	plainExit, plain, plainErr := runForTest(t, []string{"schema"}, "", nil)
	prettyExit, pretty, prettyErr := runForTest(t, []string{"schema", "--pretty"}, "", nil)
	if plainExit != exitSuccess || prettyExit != exitSuccess || plainErr != "" || prettyErr != "" {
		t.Fatalf("schema output failures: plain %d/%q pretty %d/%q", plainExit, plainErr, prettyExit, prettyErr)
	}
	var plainValue, prettyValue any
	if err := json.Unmarshal([]byte(plain), &plainValue); err != nil {
		t.Fatalf("decode plain schema: %v", err)
	}
	if err := json.Unmarshal([]byte(pretty), &prettyValue); err != nil {
		t.Fatalf("decode pretty schema: %v", err)
	}
	if !reflect.DeepEqual(plainValue, prettyValue) || !strings.Contains(pretty, "\n  ") {
		t.Fatalf("pretty output changed data or did not indent")
	}
	helpExit, help, helpErr := runForTest(t, []string{"snapshot", "--help"}, "", nil)
	if helpExit != exitSuccess || helpErr != "" || !strings.HasPrefix(help, "Usage: python-canvas snapshot") {
		t.Fatalf("help output = exit %d stdout %q stderr %q", helpExit, help, helpErr)
	}
}

func snapshotAtRevision(revision int) contracts.ProjectSnapshotV2 {
	snapshot := contracts.FixtureProjectSnapshotV2()
	snapshot.Project.Revision = revision
	snapshot.DiagnosticsRevision = revision
	return snapshot
}

func writeJSONResponse(t *testing.T, response http.ResponseWriter, value any) {
	t.Helper()
	response.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(response).Encode(value); err != nil {
		t.Errorf("encode response: %v", err)
	}
}

func runForTest(t *testing.T, arguments []string, stdin string, client HTTPClient) (int, string, string) {
	t.Helper()
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	exitCode := Run(context.Background(), arguments, Options{
		Stdin:      strings.NewReader(stdin),
		Stdout:     &stdout,
		Stderr:     &stderr,
		HTTPClient: client,
	})
	return exitCode, stdout.String(), stderr.String()
}

func decodeError(t *testing.T, content string) errorDetail {
	t.Helper()
	var document errorDocument
	if err := json.Unmarshal([]byte(content), &document); err != nil {
		t.Fatalf("decode error document %q: %v", content, err)
	}
	return document.Error
}

func containsString(values []string, value string) bool {
	for _, candidate := range values {
		if candidate == value {
			return true
		}
	}
	return false
}

type recordingClient struct {
	requests []*http.Request
}

func (client *recordingClient) Do(request *http.Request) (*http.Response, error) {
	client.requests = append(client.requests, request)
	return nil, errors.New("request must not be sent")
}
