package projectstate

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestReadOrderedJSONSourceObjectRejectsUnsupportedStructuredDataPayloads(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		path    string
		content string
		wantErr string
	}{
		{
			name:    "yaml non json type",
			path:    "source.yaml",
			content: "items: !!set {a: null, b: null}\n",
			wantErr: "JSON-compatible",
		},
		{
			name:    "toml non json type",
			path:    "source.toml",
			content: "when = 2020-01-01T00:00:00Z\n",
			wantErr: "JSON-compatible",
		},
		{
			name:    "top level list",
			path:    "source.json",
			content: "[1, 2]\n",
			wantErr: "object at the root",
		},
		{
			name:    "unknown extension",
			path:    "source.txt",
			content: "{}\n",
			wantErr: "unsupported jsonSource file extension",
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			root := t.TempDir()
			path := filepath.Join(root, tc.path)
			if err := os.WriteFile(path, []byte(tc.content), 0o644); err != nil {
				t.Fatalf("write structured data payload: %v", err)
			}

			_, _, err := readOrderedJSONSourceObject(path)
			if err == nil {
				t.Fatal("expected structured data read error")
			}
			if !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("expected error containing %q, got %q", tc.wantErr, err.Error())
			}
		})
	}
}
