package codegen

import (
	"strconv"
	"testing"

	"setta/internal/projectstate"
)

func TestPythonValueCodecFormatCallableSectionHandlesPassingStylesAndOrder(t *testing.T) {
	t.Parallel()

	argsKey := PythonCodeObjectDependencyKey("section", "args")
	kwKey := PythonCodeObjectDependencyKey("section", "color")
	graph := &PythonDependencyGraph{
		Nodes: map[PythonDependencyKey]PythonDependencyNode{
			argsKey: &PythonParamNode{
				PythonDependencyNodeBase: PythonDependencyNodeBase{
					ID:               "param-args",
					Name:             "args",
					FullPathName:     "section__args",
					Deps:             map[PythonDependencyKey]bool{},
					IncludeInCodegen: true,
					Value:            LiteralDependencyValue{Payload: "value"},
				},
				CodeObjectType: "CodeParam",
				PassingStyle:   "ARGS",
			},
			kwKey: &PythonParamNode{
				PythonDependencyNodeBase: PythonDependencyNodeBase{
					ID:               "param-color",
					Name:             "color",
					FullPathName:     "section__color",
					Deps:             map[PythonDependencyKey]bool{},
					IncludeInCodegen: true,
					Value:            LiteralDependencyValue{Payload: "blue"},
				},
				CodeObjectType: "CodeParam",
				PassingStyle:   "KEYWORD_ONLY",
			},
		},
	}
	lookup := map[PythonDependencyKey]string{
		argsKey: "self.section__args",
		kwKey:   "self.section__color",
	}
	codec := NewPythonValueCodec(graph, func(key PythonDependencyKey) string {
		return lookup[key]
	}, PythonValueCodecOptions{})

	section := &PythonSectionNode{
		PythonDependencyNodeBase: PythonDependencyNodeBase{
			ID:               "section",
			Name:             "Call",
			FullPathName:     "call",
			Deps:             map[PythonDependencyKey]bool{argsKey: true, kwKey: true},
			DepOrder:         []PythonDependencyKey{argsKey, kwKey},
			IncludeInCodegen: true,
			Value:            LiteralDependencyValue{Payload: "my_callable"},
		},
		SectionType: "Callable",
	}

	rendered, handled, err := codec.FormatSection(section)
	if err != nil {
		t.Fatalf("format callable section: %v", err)
	}
	if !handled {
		t.Fatal("expected callable section to be handled")
	}
	if rendered != "my_callable(*self.section__args, color=self.section__color)" {
		t.Fatalf("unexpected callable rendering %q", rendered)
	}
}

func TestPythonValueCodecFormatsParamRepresentations(t *testing.T) {
	t.Parallel()

	codec := NewPythonValueCodec(nil, nil, PythonValueCodecOptions{})

	t.Run("text string literal", func(t *testing.T) {
		t.Parallel()

		node := &PythonParamNode{
			PythonDependencyNodeBase: PythonDependencyNodeBase{
				ID:               "param-text",
				Name:             "text",
				FullPathName:     "section__text",
				Deps:             map[PythonDependencyKey]bool{},
				IncludeInCodegen: true,
				Value:            LiteralDependencyValue{Payload: "2+2"},
			},
			CodeObjectType: "TextParam",
		}
		rendered, err := codec.FormatParamExpression(node)
		if err != nil {
			t.Fatalf("format text param: %v", err)
		}
		if rendered != "'2+2'" {
			t.Fatalf("unexpected text param rendering %q", rendered)
		}
	})

	t.Run("code expression", func(t *testing.T) {
		t.Parallel()

		node := &PythonParamNode{
			PythonDependencyNodeBase: PythonDependencyNodeBase{
				ID:               "param-code",
				Name:             "code",
				FullPathName:     "section__code",
				Deps:             map[PythonDependencyKey]bool{},
				IncludeInCodegen: true,
				Value:            LiteralDependencyValue{Payload: "2+2"},
			},
			CodeObjectType: "CodeParam",
		}
		rendered, err := codec.FormatParamExpression(node)
		if err != nil {
			t.Fatalf("format code param: %v", err)
		}
		if rendered != "2+2" {
			t.Fatalf("unexpected code param rendering %q", rendered)
		}
	})

	t.Run("json parsed", func(t *testing.T) {
		t.Parallel()

		node := &PythonParamNode{
			PythonDependencyNodeBase: PythonDependencyNodeBase{
				ID:               "param-slider",
				Name:             "slider",
				FullPathName:     "section__slider",
				Deps:             map[PythonDependencyKey]bool{},
				IncludeInCodegen: true,
				Value:            LiteralDependencyValue{Payload: "[1,2,3]"},
			},
			CodeObjectType:      "SliderParam",
			ValueRepresentation: projectstate.PythonCodeObjValueRepresentationJSONParsed,
		}
		rendered, err := codec.FormatParamExpression(node)
		if err != nil {
			t.Fatalf("format json param: %v", err)
		}
		if rendered != "[1, 2, 3]" {
			t.Fatalf("unexpected json parsed rendering %q", rendered)
		}
	})

	t.Run("invalid json fallback", func(t *testing.T) {
		t.Parallel()

		node := &PythonParamNode{
			PythonDependencyNodeBase: PythonDependencyNodeBase{
				ID:               "param-slider",
				Name:             "slider",
				FullPathName:     "section__slider",
				Deps:             map[PythonDependencyKey]bool{},
				IncludeInCodegen: true,
				Value:            LiteralDependencyValue{Payload: "{invalid"},
			},
			CodeObjectType:      "SliderParam",
			ValueRepresentation: projectstate.PythonCodeObjValueRepresentationJSONParsed,
		}
		rendered, err := codec.FormatParamExpression(node)
		if err != nil {
			t.Fatalf("format invalid json param: %v", err)
		}
		if rendered != "'{invalid'" {
			t.Fatalf("unexpected invalid json fallback %q", rendered)
		}
	})
}

func TestPythonValueCodecFormatsPasswordAndFileHelpers(t *testing.T) {
	t.Parallel()

	t.Run("password param", func(t *testing.T) {
		t.Parallel()

		codec := NewPythonValueCodec(nil, nil, PythonValueCodecOptions{
			HelperModuleAlias: "_helpers",
		})
		node := &PythonParamNode{
			PythonDependencyNodeBase: PythonDependencyNodeBase{
				ID:               "param-secret",
				Name:             "secret",
				FullPathName:     "section__secret",
				Deps:             map[PythonDependencyKey]bool{},
				IncludeInCodegen: true,
				Value:            LiteralDependencyValue{Payload: "ignore-me"},
			},
			CodeObjectType:   "PasswordParam",
			CodeObjectImplID: "impl-secret",
		}
		rendered, err := codec.FormatParamExpression(node)
		if err != nil {
			t.Fatalf("format password param: %v", err)
		}
		if rendered != "_helpers.read_password_value('impl-secret')" {
			t.Fatalf("unexpected password rendering %q", rendered)
		}
		if imports := codec.RequiredImports(); len(imports) != 1 || imports[0] != "from setta.code_gen.python import value_helpers as _helpers" {
			t.Fatalf("unexpected password imports %#v", imports)
		}
	})

	t.Run("packaged file read", func(t *testing.T) {
		t.Parallel()

		codec := NewPythonValueCodec(nil, nil, PythonValueCodecOptions{
			Mode:              PythonValueModePackagedRuntime,
			HelperModuleAlias: "_helpers",
		})
		rendered, err := codec.FormatDependencyValue(FileReadDependencyValue{Path: "/tmp/file.txt"})
		if err != nil {
			t.Fatalf("format file read value: %v", err)
		}
		if rendered != "_helpers.read_file_value('/tmp/file.txt')" {
			t.Fatalf("unexpected file read rendering %q", rendered)
		}
		if imports := codec.RequiredImports(); len(imports) != 1 || imports[0] != "from setta.code_gen.python import value_helpers as _helpers" {
			t.Fatalf("unexpected file read imports %#v", imports)
		}
	})
}

func TestPythonValueCodecFormatsSectionsByRepresentation(t *testing.T) {
	t.Parallel()

	t.Run("plugin literal", func(t *testing.T) {
		t.Parallel()

		codec := NewPythonValueCodec(nil, nil, PythonValueCodecOptions{})
		node := &PythonSectionNode{
			PythonDependencyNodeBase: PythonDependencyNodeBase{
				ID:               "plugin",
				Name:             "Plugin",
				FullPathName:     "plugin",
				Deps:             map[PythonDependencyKey]bool{},
				IncludeInCodegen: true,
				Value:            LiteralDependencyValue{Payload: "{'alpha': 1, 'beta': 'ok'}"},
			},
			SectionType: "Plugin",
		}
		rendered, handled, err := codec.FormatSection(node)
		if err != nil {
			t.Fatalf("format plugin section: %v", err)
		}
		if !handled {
			t.Fatal("expected plugin section to be handled")
		}
		if rendered != "{'alpha': 1, 'beta': 'ok'}" {
			t.Fatalf("unexpected plugin rendering %q", rendered)
		}
	})

	t.Run("draw file read", func(t *testing.T) {
		t.Parallel()

		codec := NewPythonValueCodec(nil, nil, PythonValueCodecOptions{
			Mode:              PythonValueModePackagedRuntime,
			HelperModuleAlias: "_helpers",
		})
		node := &PythonSectionNode{
			PythonDependencyNodeBase: PythonDependencyNodeBase{
				ID:               "draw",
				Name:             "Draw",
				FullPathName:     "draw",
				Deps:             map[PythonDependencyKey]bool{},
				IncludeInCodegen: true,
				Value:            FileReadDependencyValue{Path: "/tmp/draw.png"},
			},
			SectionType:    "Draw",
			Representation: projectstate.PythonSectionRepresentationFileRead,
		}
		rendered, handled, err := codec.FormatSection(node)
		if err != nil {
			t.Fatalf("format draw section: %v", err)
		}
		if !handled {
			t.Fatal("expected draw section to be handled")
		}
		if rendered != "_helpers.read_file_value('/tmp/draw.png')" {
			t.Fatalf("unexpected draw rendering %q", rendered)
		}
	})

	t.Run("meta control text", func(t *testing.T) {
		t.Parallel()

		codec := NewPythonValueCodec(nil, nil, PythonValueCodecOptions{})
		node := &PythonSectionNode{
			PythonDependencyNodeBase: PythonDependencyNodeBase{
				ID:               "meta",
				Name:             "Meta",
				FullPathName:     "meta",
				Deps:             map[PythonDependencyKey]bool{},
				IncludeInCodegen: true,
				Value:            LiteralDependencyValue{Payload: "secret"},
			},
			SectionType:        "MetaControl",
			ControlCodeObjType: "TextParam",
		}
		rendered, handled, err := codec.FormatSection(node)
		if err != nil {
			t.Fatalf("format meta control section: %v", err)
		}
		if !handled {
			t.Fatal("expected meta control section to be handled")
		}
		if rendered != "'secret'" {
			t.Fatalf("unexpected meta control rendering %q", rendered)
		}
	})
}

func TestPythonValueCodecFormatsDropzoneRepresentations(t *testing.T) {
	t.Parallel()

	liveCodec := NewPythonValueCodec(nil, nil, PythonValueCodecOptions{})
	packagedCodec := NewPythonValueCodec(nil, nil, PythonValueCodecOptions{
		Mode:              PythonValueModePackagedRuntime,
		HelperModuleAlias: "_helpers",
	})

	t.Run("empty payload", func(t *testing.T) {
		t.Parallel()

		node := &PythonParamNode{
			PythonDependencyNodeBase: PythonDependencyNodeBase{
				ID:               "dropzone-empty",
				Name:             "dropzone",
				FullPathName:     "section__dropzone",
				Deps:             map[PythonDependencyKey]bool{},
				IncludeInCodegen: true,
				Value:            LiteralDependencyValue{Payload: ""},
			},
			CodeObjectType:      "DropzoneParam",
			ValueRepresentation: projectstate.PythonCodeObjValueRepresentationFilePath,
		}
		rendered, err := liveCodec.FormatParamExpression(node)
		if err != nil {
			t.Fatalf("format empty dropzone: %v", err)
		}
		if rendered != "[]" {
			t.Fatalf("unexpected empty dropzone rendering %q", rendered)
		}
	})

	t.Run("file path payload", func(t *testing.T) {
		t.Parallel()

		node := &PythonParamNode{
			PythonDependencyNodeBase: PythonDependencyNodeBase{
				ID:               "dropzone-file-path",
				Name:             "dropzone",
				FullPathName:     "section__dropzone",
				Deps:             map[PythonDependencyKey]bool{},
				IncludeInCodegen: true,
				Value:            LiteralDependencyValue{Payload: `{"attachments":[{"kind":"file","id":"artifacts/test.txt","name":"test.txt","mimeType":"text/plain","size":12},{"kind":"text","id":"text:abc","name":"Dropped text","text":"hello"}]}`},
			},
			CodeObjectType:      "DropzoneParam",
			ValueRepresentation: projectstate.PythonCodeObjValueRepresentationFilePath,
		}
		rendered, err := liveCodec.FormatParamExpression(node)
		if err != nil {
			t.Fatalf("format dropzone file path: %v", err)
		}
		if rendered != "['artifacts/test.txt', 'hello']" {
			t.Fatalf("unexpected dropzone file path rendering %q", rendered)
		}
	})

	t.Run("file read payload", func(t *testing.T) {
		t.Parallel()

		node := &PythonParamNode{
			PythonDependencyNodeBase: PythonDependencyNodeBase{
				ID:               "dropzone-file-read",
				Name:             "dropzone",
				FullPathName:     "section__dropzone",
				Deps:             map[PythonDependencyKey]bool{},
				IncludeInCodegen: true,
				Value:            LiteralDependencyValue{Payload: `{"attachments":[{"kind":"file","id":"/tmp/test.txt","name":"test.txt"},{"kind":"text","id":"text:abc","name":"Dropped text","text":"hello"}]}`},
			},
			CodeObjectType:      "DropzoneParam",
			ValueRepresentation: projectstate.PythonCodeObjValueRepresentationFileRead,
		}
		rendered, err := packagedCodec.FormatParamExpression(node)
		if err != nil {
			t.Fatalf("format dropzone file read: %v", err)
		}
		if rendered != "[_helpers.read_file_value('/tmp/test.txt'), 'hello']" {
			t.Fatalf("unexpected dropzone file read rendering %q", rendered)
		}
	})

	t.Run("invalid payload fallback", func(t *testing.T) {
		t.Parallel()

		node := &PythonParamNode{
			PythonDependencyNodeBase: PythonDependencyNodeBase{
				ID:               "dropzone-invalid",
				Name:             "dropzone",
				FullPathName:     "section__dropzone",
				Deps:             map[PythonDependencyKey]bool{},
				IncludeInCodegen: true,
				Value:            LiteralDependencyValue{Payload: "{invalid"},
			},
			CodeObjectType:      "DropzoneParam",
			ValueRepresentation: projectstate.PythonCodeObjValueRepresentationFilePath,
		}
		rendered, err := liveCodec.FormatParamExpression(node)
		if err != nil {
			t.Fatalf("format invalid dropzone: %v", err)
		}
		if rendered != "'{invalid'" {
			t.Fatalf("unexpected invalid dropzone fallback %q", rendered)
		}
	})
}

func TestPythonValueCodecFormatsMultilineCollections(t *testing.T) {
	t.Parallel()

	depKeys := []PythonDependencyKey{
		PythonCodeObjectDependencyKey("section", "param-1"),
		PythonCodeObjectDependencyKey("section", "param-2"),
		PythonCodeObjectDependencyKey("section", "param-3"),
		PythonCodeObjectDependencyKey("section", "param-4"),
	}
	nodes := map[PythonDependencyKey]PythonDependencyNode{}
	lookup := map[PythonDependencyKey]string{}
	deps := map[PythonDependencyKey]bool{}
	for index, depKey := range depKeys {
		name := "param_" + strconv.Itoa(index+1)
		nodes[depKey] = &PythonParamNode{
			PythonDependencyNodeBase: PythonDependencyNodeBase{
				ID:               "param-" + strconv.Itoa(index+1),
				Name:             name,
				FullPathName:     "section__" + name,
				Deps:             map[PythonDependencyKey]bool{},
				IncludeInCodegen: true,
			},
			CodeObjectType: "CodeParam",
		}
		lookup[depKey] = "self.section__" + name
		deps[depKey] = true
	}
	codec := NewPythonValueCodec(&PythonDependencyGraph{Nodes: nodes}, func(key PythonDependencyKey) string {
		return lookup[key]
	}, PythonValueCodecOptions{
		CollectionItemIndent:        "            ",
		CollectionCloseIndent:       "        ",
		MultilineCollectionMinItems: 4,
	})

	rendered, err := codec.FormatDict(deps, depKeys)
	if err != nil {
		t.Fatalf("format multiline dict: %v", err)
	}
	expected := "{\n" +
		"            'param_1': self.section__param_1,\n" +
		"            'param_2': self.section__param_2,\n" +
		"            'param_3': self.section__param_3,\n" +
		"            'param_4': self.section__param_4,\n" +
		"        }"
	if rendered != expected {
		t.Fatalf("unexpected multiline dict rendering:\n%s", rendered)
	}
}
