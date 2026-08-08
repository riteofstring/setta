package projectstate

import (
	"os"
	"path/filepath"
	"reflect"
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

func TestReadOrderedJSONSourceObjectPreservesStructuredDataOrderAcrossFormats(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		path    string
		content string
	}{
		{
			name: "json",
			path: "source.json",
			content: "{\n" +
				"  \"beta\": [1, {\"nested\": \"two\"}],\n" +
				"  \"alpha\": {\"inner\": true, \"later\": 3}\n" +
				"}\n",
		},
		{
			name: "yaml",
			path: "source.yaml",
			content: "beta:\n" +
				"  - 1\n" +
				"  - nested: two\n" +
				"alpha:\n" +
				"  inner: true\n" +
				"  later: 3\n",
		},
		{
			name: "toml",
			path: "source.toml",
			content: "beta = [1, { nested = \"two\" }]\n\n" +
				"[alpha]\n" +
				"inner = true\n" +
				"later = 3\n",
		},
	}

	want := map[string]any{
		"alpha": map[string]any{
			"inner": true,
			"later": float64(3),
		},
		"beta": []any{
			float64(1),
			map[string]any{
				"nested": "two",
			},
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

			payload, exists, err := readOrderedJSONSourceObject(path)
			if err != nil {
				t.Fatalf("read ordered json source object: %v", err)
			}
			if !exists {
				t.Fatal("expected structured data payload to exist")
			}

			assertJSONSourceEntryOrder(t, payload, []string{"beta", "alpha"})

			alphaValue, ok := payload.lookup("alpha")
			if !ok || alphaValue.Object == nil {
				t.Fatalf("expected alpha object entry, got %#v", alphaValue)
			}
			assertJSONSourceEntryOrder(t, *alphaValue.Object, []string{"inner", "later"})

			if got := mustJSONSourceObjectAsMap(t, payload); !reflect.DeepEqual(got, want) {
				t.Fatalf("expected structured data payload %#v, got %#v", want, got)
			}
		})
	}
}
