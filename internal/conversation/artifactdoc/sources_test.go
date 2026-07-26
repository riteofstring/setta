package artifactdoc

import (
	"strings"
	"testing"
)

func TestFileReferenceSourceRendersLosslessProfileLiterals(t *testing.T) {
	source, err := FileReferenceSource(`docs/report "final".md`, "Director's report")
	if err != nil {
		t.Fatalf("render file reference source: %v", err)
	}
	document, err := Compile(SettaCatalogV1(), source)
	if err != nil {
		t.Fatalf("compile rendered file reference: %v", err)
	}
	blocks, ok := document.Root.Props["blocks"].([]any)
	if !ok || len(blocks) != 1 {
		t.Fatalf("rendered document blocks = %#v, want one file reference", document.Root.Props["blocks"])
	}
	reference, ok := blocks[0].(Node)
	if !ok || reference.Component != ComponentFileReference {
		t.Fatalf("rendered document block = %#v, want FileReference", blocks[0])
	}
	if reference.Props["path"] != `docs/report "final".md` ||
		reference.Props["description"] != "Director's report" {
		t.Fatalf("rendered file reference props = %#v", reference.Props)
	}
	paths, err := document.FileReferencePaths()
	if err != nil {
		t.Fatalf("inspect rendered file references: %v", err)
	}
	if len(paths) != 1 || paths[0] != `docs/report "final".md` {
		t.Fatalf("rendered file reference paths = %#v", paths)
	}
}

func TestFileReferenceSourceRejectsInvalidUTF8BeforeJSONCanReplaceIt(t *testing.T) {
	invalid := string([]byte{0xff})
	for _, testCase := range []struct {
		name        string
		path        string
		description string
	}{
		{name: "path", path: invalid, description: "Generated image"},
		{name: "description", path: "generated.png", description: invalid},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := FileReferenceSource(testCase.path, testCase.description)
			if err == nil || !strings.Contains(err.Error(), "not valid UTF-8") {
				t.Fatalf("render file reference error = %v, want invalid UTF-8", err)
			}
		})
	}
}
