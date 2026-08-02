package typescriptverifier

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"

	"setta/internal/evalharness"
)

func TestCheckRelatedChangesRequiresExactTaskFiles(t *testing.T) {
	tests := []struct {
		name     string
		changes  []string
		required []string
		allowed  []string
		passed   bool
	}{
		{
			name:     "exact task files",
			changes:  []string{"README.md", "src/server.ts", "test/server.test.ts"},
			required: []string{"README.md", "src/server.ts", "test/server.test.ts"},
			allowed:  []string{"README.md", "src/server.ts", "test/server.test.ts"},
			passed:   true,
		},
		{
			name:     "missing automated test change",
			changes:  []string{"README.md", "src/server.ts"},
			required: []string{"README.md", "src/server.ts", "test/server.test.ts"},
			allowed:  []string{"README.md", "src/server.ts", "test/server.test.ts"},
			passed:   false,
		},
		{
			name:     "unrelated source change",
			changes:  []string{"src/server.ts", "src/unrelated.ts", "test/server.test.ts"},
			required: []string{"src/server.ts", "test/server.test.ts"},
			allowed:  []string{"src/server.ts", "test/server.test.ts"},
			passed:   false,
		},
		{
			name:     "allowed optional test change omitted",
			changes:  []string{"src/server.ts"},
			required: []string{"src/server.ts"},
			allowed:  []string{"src/server.ts", "test/server.test.ts"},
			passed:   true,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			result := checkRelatedChanges(test.changes, test.required, test.allowed)
			if result.Passed != test.passed {
				t.Fatalf("related changes check = %#v, want passed %t", result, test.passed)
			}
		})
	}
}

func TestMarkdownSectionStopsAtTheNextPeerHeading(t *testing.T) {
	document := "# Fixture\n\n## Development\n\nRun tests.\n\n## Operations\n\nRun pnpm run format.\n"
	section, exists := markdownSection(document, "## Development")
	if !exists {
		t.Fatal("Development section was not found")
	}
	if strings.Contains(section, "pnpm run format") || !strings.Contains(section, "Run tests.") {
		t.Fatalf("Development section = %q", section)
	}
}

func TestVerifierAcceptsEachExactScenarioOutcome(t *testing.T) {
	tests := []struct {
		verifierID  string
		path        string
		sourceValue string
		bodyValue   string
		document    bool
		changeTest  bool
	}{
		{
			verifierID:  evalharness.ScenarioVerifierStraightforward,
			path:        "/health",
			sourceValue: `{ ok: true }`,
			bodyValue:   `{ ok: true }`,
			document:    true,
			changeTest:  true,
		},
		{
			verifierID:  evalharness.ScenarioVerifierApparentAmbiguity,
			path:        "/ready",
			sourceValue: `{ ready: true, version: packageVersion }`,
			bodyValue:   `{ ready: true, version: "1.2.3" }`,
			changeTest:  true,
		},
		{
			verifierID:  evalharness.ScenarioVerifierGenuineAmbiguity,
			path:        "/ready",
			sourceValue: `{ ready: true, version: packageVersion }`,
			bodyValue:   `{ ready: true, version: "1.2.3" }`,
			changeTest:  true,
		},
		{
			verifierID:  evalharness.ScenarioVerifierMidRunSteering,
			path:        "/status",
			sourceValue: `{ ok: true, version: packageVersion }`,
			bodyValue:   `{ ok: true, version: "1.2.3" }`,
			changeTest:  true,
		},
		{
			verifierID:  evalharness.ScenarioVerifierQueueThenCancel,
			path:        "/version",
			sourceValue: `{ version: packageVersion }`,
			bodyValue:   `{ version: "1.2.3" }`,
		},
	}
	fixtureRoot := fixtureRoot(t)
	for _, test := range tests {
		t.Run(test.verifierID, func(t *testing.T) {
			baselineRoot := filepath.Join(t.TempDir(), "baseline")
			workspaceRoot := filepath.Join(t.TempDir(), "workspace")
			for _, destination := range []string{baselineRoot, workspaceRoot} {
				if err := os.CopyFS(destination, os.DirFS(fixtureRoot)); err != nil {
					t.Fatalf("copy fixture to %s: %v", filepath.Base(destination), err)
				}
			}
			addRoute(t, workspaceRoot, test.path, test.sourceValue, test.bodyValue, test.changeTest)
			if test.document {
				appendTestFile(
					t,
					filepath.Join(workspaceRoot, "README.md"),
					"\nThe service exposes GET /health, which returns {\"ok\":true}.\n",
				)
			}

			result, err := Verify(context.Background(), test.verifierID, baselineRoot, workspaceRoot)
			if err != nil {
				t.Fatalf("verify correct fixture: %v", err)
			}
			if !result.Passed {
				t.Fatalf("correct fixture failed verification: %#v", result.Checks)
			}
			wantChanges := []string{"src/server.ts"}
			if test.changeTest {
				wantChanges = append(wantChanges, "test/server.test.ts")
			}
			if test.document {
				wantChanges = []string{"README.md", "src/server.ts", "test/server.test.ts"}
			}
			if !reflect.DeepEqual(result.ChangedFiles, wantChanges) {
				t.Fatalf("changed files = %q, want %q", result.ChangedFiles, wantChanges)
			}
		})
	}
}

func TestVerifierAcceptsExpandedScenarioOutcomes(t *testing.T) {
	tests := []struct {
		verifierID string
		changes    []string
		prepare    func(*testing.T, string)
	}{
		{
			verifierID: evalharness.ScenarioVerifierDocumentationOnly,
			changes:    []string{"README.md"},
			prepare: func(t *testing.T, root string) {
				appendTestFile(t, filepath.Join(root, "README.md"), "\nCheck formatting with `pnpm run format`.\n")
			},
		},
		{
			verifierID: evalharness.ScenarioVerifierExternalFile,
			changes:    []string{"release-manifest.json"},
			prepare: func(t *testing.T, root string) {
				writeTestFile(
					t,
					filepath.Join(root, "release-manifest.json"),
					"{\n  \"package\": \"setta-eval-typescript-service\",\n  \"release\": \"1.2.3\"\n}\n",
				)
			},
		},
		{
			verifierID: evalharness.ScenarioVerifierRamblingPort,
			changes:    []string{"src/server.ts", "test/server.test.ts"},
			prepare:    preparePortValidationOutcome,
		},
		{
			verifierID: evalharness.ScenarioVerifierRequestLogging,
			changes:    []string{"src/server.ts", "test/server.test.ts"},
			prepare:    prepareRequestLoggingOutcome,
		},
		{
			verifierID: evalharness.ScenarioVerifierStableReleaseData,
			changes:    []string{"data/stable-releases.json"},
			prepare: func(t *testing.T, root string) {
				writeTestFile(
					t,
					filepath.Join(root, "data", "stable-releases.json"),
					"[\n  { \"service\": \"api\", \"version\": \"1.4.0\" },\n  { \"service\": \"worker\", \"version\": \"1.9.2\" }\n]\n",
				)
			},
		},
	}
	fixtureRoot := fixtureRoot(t)
	for _, test := range tests {
		t.Run(test.verifierID, func(t *testing.T) {
			baselineRoot := filepath.Join(t.TempDir(), "baseline")
			workspaceRoot := filepath.Join(t.TempDir(), "workspace")
			for _, destination := range []string{baselineRoot, workspaceRoot} {
				if err := os.CopyFS(destination, os.DirFS(fixtureRoot)); err != nil {
					t.Fatalf("copy fixture to %s: %v", filepath.Base(destination), err)
				}
			}
			test.prepare(t, workspaceRoot)
			result, err := Verify(context.Background(), test.verifierID, baselineRoot, workspaceRoot)
			if err != nil {
				t.Fatalf("verify correct fixture: %v", err)
			}
			if !result.Passed {
				t.Fatalf("correct fixture failed verification: %#v", result.Checks)
			}
			if !reflect.DeepEqual(result.ChangedFiles, test.changes) {
				t.Fatalf("changed files = %q, want %q", result.ChangedFiles, test.changes)
			}
		})
	}
}

func preparePortValidationOutcome(t *testing.T, root string) {
	t.Helper()
	sourcePath := filepath.Join(root, "src", "server.ts")
	replaceTestFile(
		t,
		sourcePath,
		"function parsePort(value: string | undefined) {\n  const port = Number.parseInt(value ?? \"3000\", 10);",
		"export function parsePort(value: string | undefined) {\n  const normalized = value ?? \"3000\";\n  if (!/^\\d+$/.test(normalized)) {\n    throw new Error(`Invalid PORT value: ${normalized}`);\n  }\n  const port = Number(normalized);",
	)
	testPath := filepath.Join(root, "test", "server.test.ts")
	replaceTestFile(
		t,
		testPath,
		`import { createServer } from "../src/server.ts";`,
		`import { createServer, parsePort } from "../src/server.ts";`,
	)
	appendTestFile(t, testPath, `

test("PORT parsing rejects trailing characters", () => {
  assert.throws(() => parsePort("3000oops"), /Invalid PORT/);
  assert.equal(parsePort("3000"), 3000);
});
`)
}

func prepareRequestLoggingOutcome(t *testing.T, root string) {
	t.Helper()
	sourcePath := filepath.Join(root, "src", "server.ts")
	replaceTestFile(
		t,
		sourcePath,
		"function logRequest(request: IncomingMessage) {",
		"export function logRequest(request: IncomingMessage) {",
	)
	replaceTestFile(
		t,
		sourcePath,
		`JSON.stringify({ event: "request", path: request.url ?? "/" })`,
		`JSON.stringify({ event: "request", method: request.method ?? "", path: request.url ?? "/" })`,
	)
	testPath := filepath.Join(root, "test", "server.test.ts")
	replaceTestFile(
		t,
		testPath,
		`import type { AddressInfo } from "node:net";`,
		`import type { AddressInfo } from "node:net";
import type { IncomingMessage } from "node:http";`,
	)
	replaceTestFile(
		t,
		testPath,
		`import { createServer } from "../src/server.ts";`,
		`import { createServer, logRequest } from "../src/server.ts";`,
	)
	appendTestFile(t, testPath, `

test("request logs include method and path", () => {
  let output = "";
  const originalWrite = process.stdout.write;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  try {
    logRequest({ method: "GET", url: "/example" } as IncomingMessage);
  } finally {
    process.stdout.write = originalWrite;
  }
  assert.deepEqual(JSON.parse(output), {
    event: "request",
    method: "GET",
    path: "/example",
  });
});
`)
}

func fixtureRoot(t *testing.T) string {
	t.Helper()
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve verifier test source")
	}
	return filepath.Clean(filepath.Join(
		filepath.Dir(filename),
		"..",
		"..",
		"..",
		"evals",
		"fixtures",
		"typescript-service",
	))
}

func addRoute(
	t *testing.T,
	workspaceRoot string,
	path string,
	sourceValue string,
	bodyValue string,
	changeTest bool,
) {
	t.Helper()
	replaceTestFile(
		t,
		filepath.Join(workspaceRoot, "src", "server.ts"),
		`    writeJSON(response, 404, { error: "not_found" });`,
		fmt.Sprintf(`    if (request.method === "GET" && request.url === %q) {
      writeJSON(response, 200, %s);
      return;
    }
    writeJSON(response, 404, { error: "not_found" });`, path, sourceValue),
	)
	if changeTest {
		appendTestFile(
			t,
			filepath.Join(workspaceRoot, "test", "server.test.ts"),
			fmt.Sprintf(`

test(%q, async (context) => {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  context.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      }),
  );

  const address = server.address() as AddressInfo;
  const response = await fetch("http://127.0.0.1:" + address.port + %q);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.deepEqual(await response.json(), %s);
});
`, "GET "+path+" returns the expected body", path, bodyValue),
		)
	}
}

func TestValidateWorkspaceTreeRejectsSymlinksInsideIgnoredDirectories(t *testing.T) {
	root := t.TempDir()
	dist := filepath.Join(root, "dist")
	if err := os.Mkdir(dist, 0o700); err != nil {
		t.Fatalf("create ignored directory: %v", err)
	}
	if err := os.Symlink("missing", filepath.Join(dist, "server.js")); err != nil {
		t.Fatalf("create ignored symlink: %v", err)
	}
	if err := validateWorkspaceTree(root); err == nil || !strings.Contains(err.Error(), "symbolic link") {
		t.Fatalf("workspace tree error = %v", err)
	}
}

func replaceTestFile(t *testing.T, path string, old string, replacement string) {
	t.Helper()
	contents, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", filepath.Base(path), err)
	}
	updated := strings.Replace(string(contents), old, replacement, 1)
	if updated == string(contents) {
		t.Fatalf("%s omitted replacement target", filepath.Base(path))
	}
	if err := os.WriteFile(path, []byte(updated), 0o600); err != nil {
		t.Fatalf("write %s: %v", filepath.Base(path), err)
	}
}

func appendTestFile(t *testing.T, path string, addition string) {
	t.Helper()
	file, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0)
	if err != nil {
		t.Fatalf("open %s: %v", filepath.Base(path), err)
	}
	_, writeErr := file.WriteString(addition)
	closeErr := file.Close()
	if writeErr != nil || closeErr != nil {
		t.Fatalf("append %s: write %v, close %v", filepath.Base(path), writeErr, closeErr)
	}
}

func writeTestFile(t *testing.T, path string, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("write %s: %v", filepath.Base(path), err)
	}
}
