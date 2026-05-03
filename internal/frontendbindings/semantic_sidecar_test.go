package frontendbindings

import (
	"reflect"
	"strings"
	"testing"
)

func TestSemanticDiscriminatedFamilyDeclarationsForManifest(t *testing.T) {
	t.Parallel()

	manifest := semanticSidecarManifest{
		DiscriminatedFamilies: []semanticDiscriminatedFamily{
			{
				BaseType: "Widget",
				EnumType: "WidgetKind",
				Members: []semanticDiscriminatedMember{
					{Name: "Button", DiscriminatorValue: "button"},
					{Name: "Input", DiscriminatorValue: "input"},
					{Name: "Note", DiscriminatorValue: "note"},
				},
				Traits: []semanticDiscriminatedTraitSpec{
					{
						UnionName:   "InteractiveWidgetUnion",
						MemberTypes: []string{"Button", "Input"},
					},
					{
						UnionName:   "RenderableWidgetUnion",
						LocalUnion:  true,
						IncludeBase: true,
						MemberTypes: []string{"Input", "Note"},
					},
				},
			},
		},
	}

	got, err := semanticDiscriminatedFamilyDeclarationsForManifest(manifest)
	if err != nil {
		t.Fatalf("semanticDiscriminatedFamilyDeclarationsForManifest(): %v", err)
	}

	want := []TypeDeclaration{
		aliasDeclaration("WidgetUnion", "gt.WidgetUnion"),
		aliasDeclaration("InteractiveWidgetUnion", "gt.InteractiveWidgetUnion"),
		setDeclaration("InteractiveWidgetTypeSet", "WidgetKind", `"button"`, `"input"`),
		typeGuardDeclaration(
			"isInteractiveWidget",
			"WidgetUnion",
			"InteractiveWidgetUnion",
			"InteractiveWidgetTypeSet",
			"WidgetKind",
		),
		setDeclaration("RenderableWidgetTypeSet", "WidgetKind", `"input"`, `"note"`),
		typeGuardDeclaration(
			"isRenderableWidget",
			"WidgetUnion",
			unionAliasExpr("Widget", "Input", "Note"),
			"RenderableWidgetTypeSet",
			"WidgetKind",
		),
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("semanticDiscriminatedFamilyDeclarationsForManifest() mismatch\n got: %#v\nwant: %#v", got, want)
	}
}

func TestSemanticDiscriminatedFamilyDeclarationsForManifestRejectsUnknownTraitMembers(t *testing.T) {
	t.Parallel()

	manifest := semanticSidecarManifest{
		DiscriminatedFamilies: []semanticDiscriminatedFamily{
			{
				BaseType: "Widget",
				EnumType: "WidgetKind",
				Members: []semanticDiscriminatedMember{
					{Name: "Button", DiscriminatorValue: "button"},
				},
				Traits: []semanticDiscriminatedTraitSpec{
					{
						UnionName:   "InteractiveWidgetUnion",
						MemberTypes: []string{"Ghost"},
					},
				},
			},
		},
	}

	_, err := semanticDiscriminatedFamilyDeclarationsForManifest(manifest)
	if err == nil {
		t.Fatal("semanticDiscriminatedFamilyDeclarationsForManifest(): expected error")
	}
	if !strings.Contains(err.Error(), "frontend semantic sidecar family Widget trait InteractiveWidgetUnion: missing members in sidecar family: Ghost") {
		t.Fatalf("semanticDiscriminatedFamilyDeclarationsForManifest(): got %q", err)
	}
}
