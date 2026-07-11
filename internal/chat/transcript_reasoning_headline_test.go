package chat

import "testing"

func TestReasoningHeadlineUsesFirstCompleteMarkdownBoldSpan(t *testing.T) {
	tests := []struct {
		name string
		item RunItem
		want string
	}{
		{
			name: "public bold summary",
			item: RunItem{Type: RunItemTypeReasoning, Title: "Ignored title", Summary: "prefix **Mapping parser modules**\nbody"},
			want: "Mapping parser modules",
		},
		{
			name: "incomplete bold waits",
			item: RunItem{Type: RunItemTypeReasoning, Title: "Ignored title", Progress: "**Mapping parser modules"},
			want: "",
		},
		{
			name: "title does not fallback",
			item: RunItem{Type: RunItemTypeReasoning, Title: "Mapping parser modules", Summary: "Mapping parser modules"},
			want: "",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := reasoningHeadline(test.item); got != test.want {
				t.Fatalf("reasoning headline = %q, want %q", got, test.want)
			}
		})
	}
}
