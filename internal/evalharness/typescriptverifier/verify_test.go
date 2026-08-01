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
		passed   bool
	}{
		{
			name:     "exact task files",
			changes:  []string{"README.md", "src/server.ts", "test/server.test.ts"},
			required: []string{"README.md", "src/server.ts", "test/server.test.ts"},
			passed:   true,
		},
		{
			name:     "missing automated test change",
			changes:  []string{"README.md", "src/server.ts"},
			required: []string{"README.md", "src/server.ts", "test/server.test.ts"},
			passed:   false,
		},
		{
			name:     "unrelated source change",
			changes:  []string{"src/server.ts", "src/unrelated.ts", "test/server.test.ts"},
			required: []string{"src/server.ts", "test/server.test.ts"},
			passed:   false,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			result := checkRelatedChanges(test.changes, test.required)
			if result.Passed != test.passed {
				t.Fatalf("related changes check = %#v, want passed %t", result, test.passed)
			}
		})
	}
}

func TestVerifierAcceptsEachExactScenarioOutcome(t *testing.T) {
	tests := []struct {
		verifierID  string
		path        string
		sourceValue string
		bodyValue   string
		document    bool
	}{
		{
			verifierID:  evalharness.ScenarioVerifierStraightforward,
			path:        "/health",
			sourceValue: `{ ok: true }`,
			bodyValue:   `{ ok: true }`,
			document:    true,
		},
		{
			verifierID:  evalharness.ScenarioVerifierApparentAmbiguity,
			path:        "/ready",
			sourceValue: `{ ready: true, version: packageVersion }`,
			bodyValue:   `{ ready: true, version: "1.2.3" }`,
		},
		{
			verifierID:  evalharness.ScenarioVerifierGenuineAmbiguity,
			path:        "/ready",
			sourceValue: `{ ready: true, version: packageVersion }`,
			bodyValue:   `{ ready: true, version: "1.2.3" }`,
		},
		{
			verifierID:  evalharness.ScenarioVerifierMidRunSteering,
			path:        "/status",
			sourceValue: `{ ok: true, version: packageVersion }`,
			bodyValue:   `{ ok: true, version: "1.2.3" }`,
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
			addRoute(t, workspaceRoot, test.path, test.sourceValue, test.bodyValue)
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
			wantChanges := []string{"src/server.ts", "test/server.test.ts"}
			if test.document {
				wantChanges = []string{"README.md", "src/server.ts", "test/server.test.ts"}
			}
			if !reflect.DeepEqual(result.ChangedFiles, wantChanges) {
				t.Fatalf("changed files = %q, want %q", result.ChangedFiles, wantChanges)
			}
		})
	}
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
