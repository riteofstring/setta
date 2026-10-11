package evidence

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/riteofstring/setta/apps/review/backend/internal/contracts"
)

func TestResolverResolvesCodeEvidence(t *testing.T) {
	root := t.TempDir()
	codeSource := "export function publish(topic: string): void {\n  events.add(topic)\n}\n"
	writeTestFile(t, filepath.Join(root, "source", "publisher.ts"), codeSource)
	resolver, err := New(root)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	codeResult := resolver.Resolve("request-1", contracts.EvidenceReference{
		ID: "source", Kind: "code", Code: &contracts.CodeEvidenceReference{Path: "source/publisher.ts", Language: "typescript", SourceSHA256: digestBytes([]byte(codeSource))},
	})
	if codeResult.Status != "resolved" || codeResult.Content == nil || codeResult.Content.Code == nil || *codeResult.Content.Code != codeSource || codeResult.Content.Language == nil || *codeResult.Content.Language != "typescript" {
		t.Fatalf("code result = %#v", codeResult)
	}
}

func TestResolverResolvesTextJSONAndArtifactEvidence(t *testing.T) {
	root := t.TempDir()
	textSource := "start\nretry\ncomplete\n"
	jsonSource := `{"runs":[{"id":"a","errors":0},{"id":"b","errors":2}]}`
	writeTestFile(t, filepath.Join(root, "logs", "run.log"), textSource)
	writeTestFile(t, filepath.Join(root, "results.json"), jsonSource)
	artifact := []byte("review-artifact")
	writeTestFile(t, filepath.Join(root, "artifacts", "candidate.txt"), string(artifact))
	digest := sha256.Sum256(artifact)
	resolver, err := New(root)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	textResult := resolver.Resolve("request-1", contracts.EvidenceReference{
		ID: "log", Kind: "text", Text: &contracts.TextEvidenceReference{Path: "logs/run.log", MediaType: "text/plain", StartLine: 2, EndLine: 3, SourceSHA256: digestBytes([]byte(textSource))},
	})
	if textResult.Status != "resolved" || textResult.Content == nil || textResult.Content.Text == nil || *textResult.Content.Text != "retry\ncomplete" {
		t.Fatalf("text result = %#v", textResult)
	}

	jsonResult := resolver.Resolve("request-1", contracts.EvidenceReference{
		ID: "json", Kind: "json", JSON: &contracts.JSONEvidenceReference{Path: "results.json", Pointers: []string{"/runs/1/errors"}, SourceSHA256: digestBytes([]byte(jsonSource))},
	})
	if jsonResult.Status != "resolved" || jsonResult.Content == nil {
		t.Fatalf("json result = %#v", jsonResult)
	}
	var selected map[string]json.Number
	if err := json.Unmarshal(jsonResult.Content.JSON, &selected); err != nil || selected["/runs/1/errors"].String() != "2" {
		t.Fatalf("json content = %s, error = %v", jsonResult.Content.JSON, err)
	}

	artifactResult := resolver.Resolve("request-1", contracts.EvidenceReference{
		ID: "candidate", Kind: "artifact", Artifact: &contracts.ArtifactEvidenceReference{
			Path: "artifacts/candidate.txt", MediaType: "text/plain", ByteLength: int64(len(artifact)), SHA256: hex.EncodeToString(digest[:]),
		},
	})
	if artifactResult.Status != "resolved" || artifactResult.Content == nil || artifactResult.Content.Route == nil || *artifactResult.Content.Route != "/api/v1/evidence/request-1/candidate" {
		t.Fatalf("artifact result = %#v", artifactResult)
	}
}

func TestResolverKeepsUnsafeAndChangedEvidenceVisible(t *testing.T) {
	root := t.TempDir()
	outside := filepath.Join(t.TempDir(), "outside.txt")
	writeTestFile(t, outside, "outside")
	if err := os.Symlink(outside, filepath.Join(root, "linked.txt")); err != nil {
		if runtime.GOOS == "windows" {
			t.Skipf("Symlink unavailable: %v", err)
		}
		t.Fatalf("Symlink() error = %v", err)
	}
	resolver, err := New(root)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	linked := resolver.Resolve("request-1", contracts.EvidenceReference{
		ID: "linked", Kind: "text", Text: &contracts.TextEvidenceReference{Path: "linked.txt", MediaType: "text/plain", StartLine: 1, EndLine: 1, SourceSHA256: strings.Repeat("0", 64)},
	})
	if linked.Status != "failed" || linked.Error == nil || linked.Error.Code != "unsafe_path" {
		t.Fatalf("linked result = %#v", linked)
	}

	writeTestFile(t, filepath.Join(root, "artifact.txt"), "changed")
	changed := resolver.Resolve("request-1", contracts.EvidenceReference{
		ID: "changed", Kind: "artifact", Artifact: &contracts.ArtifactEvidenceReference{
			Path: "artifact.txt", MediaType: "text/plain", ByteLength: 7, SHA256: strings.Repeat("0", 64),
		},
	})
	if changed.Status != "failed" || changed.Error == nil || changed.Error.Code != "artifact_changed" {
		t.Fatalf("changed result = %#v", changed)
	}
}

func TestResolverReturnsOnlyTheRequestedGitHunk(t *testing.T) {
	git, err := exec.LookPath("git")
	if err != nil {
		t.Skip("git unavailable")
	}
	root := t.TempDir()
	repository := filepath.Join(root, "repository")
	if err := os.Mkdir(repository, 0o755); err != nil {
		t.Fatalf("Mkdir() error = %v", err)
	}
	runGit(t, git, repository, "init", "--quiet")
	runGit(t, git, repository, "config", "user.name", "Setta Test")
	runGit(t, git, repository, "config", "user.email", "setta@example.invalid")
	original := strings.Join([]string{"one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"}, "\n") + "\n"
	writeTestFile(t, filepath.Join(repository, "sample.txt"), original)
	runGit(t, git, repository, "add", "sample.txt")
	runGit(t, git, repository, "commit", "--quiet", "-m", "base")
	base := strings.TrimSpace(runGit(t, git, repository, "rev-parse", "HEAD"))
	changed := strings.ReplaceAll(strings.ReplaceAll(original, "two", "TWO"), "nine", "NINE")
	writeTestFile(t, filepath.Join(repository, "sample.txt"), changed)
	resolver, err := New(root)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	fullPatch := runGit(t, git, repository, "diff", "--no-ext-diff", "--no-color", "--unified=1", base, "--", "sample.txt")
	selectedPatch, err := selectHunk(fullPatch, contracts.GitHunk{OldStart: 1, OldLines: 3, NewStart: 1, NewLines: 3})
	if err != nil {
		t.Fatalf("selectHunk() error = %v", err)
	}
	reference := contracts.EvidenceReference{
		ID: "diff", Kind: "gitDiff", GitDiff: &contracts.GitDiffEvidenceReference{
			RepositoryPath: "repository", BaseRevision: base, Path: "sample.txt", ContextLines: 1,
			Hunk: contracts.GitHunk{OldStart: 1, OldLines: 3, NewStart: 1, NewLines: 3}, PatchSHA256: digestBytes([]byte(selectedPatch)),
		},
	}
	result := resolver.Resolve("request-1", reference)
	if result.Status != "resolved" || result.Content == nil || result.Content.UnifiedDiff == nil {
		t.Fatalf("diff result = %#v", result)
	}
	if !strings.Contains(*result.Content.UnifiedDiff, "-two") || strings.Contains(*result.Content.UnifiedDiff, "-nine") {
		t.Fatalf("selected patch = %s", *result.Content.UnifiedDiff)
	}
	writeTestFile(t, filepath.Join(repository, "sample.txt"), strings.ReplaceAll(changed, "TWO", "DEUX"))
	changedResult := resolver.Resolve("request-1", reference)
	if changedResult.Status != "failed" || changedResult.Error == nil || changedResult.Error.Code != "evidence_changed" {
		t.Fatalf("changed diff result = %#v", changedResult)
	}
}

func TestResolverRejectsChangedMutableEvidence(t *testing.T) {
	root := t.TempDir()
	codePath := filepath.Join(root, "source.py")
	textPath := filepath.Join(root, "note.txt")
	jsonPath := filepath.Join(root, "result.json")
	writeTestFile(t, codePath, "value = 'before'\n")
	writeTestFile(t, textPath, "before\n")
	writeTestFile(t, jsonPath, `{"value":"before"}`)
	codeDigest := digestBytes([]byte("value = 'before'\n"))
	textDigest := digestBytes([]byte("before\n"))
	jsonDigest := digestBytes([]byte(`{"value":"before"}`))
	writeTestFile(t, codePath, "value = 'after'\n")
	writeTestFile(t, textPath, "after\n")
	writeTestFile(t, jsonPath, `{"value":"after"}`)
	resolver, err := New(root)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	references := []contracts.EvidenceReference{
		{ID: "code", Kind: "code", Code: &contracts.CodeEvidenceReference{Path: "source.py", Language: "python", SourceSHA256: codeDigest}},
		{ID: "text", Kind: "text", Text: &contracts.TextEvidenceReference{Path: "note.txt", MediaType: "text/plain", StartLine: 1, EndLine: 1, SourceSHA256: textDigest}},
		{ID: "json", Kind: "json", JSON: &contracts.JSONEvidenceReference{Path: "result.json", Pointers: []string{}, SourceSHA256: jsonDigest}},
	}
	for _, reference := range references {
		result := resolver.Resolve("request-1", reference)
		if result.Status != "failed" || result.Error == nil || result.Error.Code != "evidence_changed" {
			t.Fatalf("%s result = %#v", reference.ID, result)
		}
	}
}

func TestResolverKeepsInvalidTextAsFailedEvidence(t *testing.T) {
	for name, source := range map[string][]byte{
		"invalid-utf8": {0xff, '\n'},
		"nul":          {'o', 'k', 0, '\n'},
	} {
		t.Run(name, func(t *testing.T) {
			root := t.TempDir()
			path := filepath.Join(root, "source.txt")
			if err := os.WriteFile(path, source, 0o644); err != nil {
				t.Fatalf("WriteFile() error = %v", err)
			}
			resolver, err := New(root)
			if err != nil {
				t.Fatalf("New() error = %v", err)
			}
			result := resolver.Resolve("request-1", contracts.EvidenceReference{
				ID: "source", Kind: "text", Text: &contracts.TextEvidenceReference{
					Path: "source.txt", MediaType: "text/plain", StartLine: 1, EndLine: 1, SourceSHA256: digestBytes(source),
				},
			})
			if result.Status != "failed" || result.Error == nil || result.Error.Code != "evidence_invalid" {
				t.Fatalf("result = %#v", result)
			}
		})
	}
}

func writeTestFile(t *testing.T, path string, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
}

func runGit(t *testing.T, git string, directory string, arguments ...string) string {
	t.Helper()
	command := exec.Command(git, append([]string{"-C", directory}, arguments...)...)
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v error = %v, output = %s", arguments, err, output)
	}
	return string(output)
}
