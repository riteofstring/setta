package renderer

import "testing"

func TestFindPythonStateReferences(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		expression string
		want       []pythonStateReference
	}{
		{
			name:       "forward reference",
			expression: "state.Producer",
			want: []pythonStateReference{{
				Path:  "Producer",
				Range: ByteRange{Start: 0, End: len("state.Producer")},
			}},
		},
		{
			name:       "longer attribute chain keeps generated target only",
			expression: "state.Factory.build(state.Other)",
			want: []pythonStateReference{
				{Path: "Factory", Range: ByteRange{Start: 0, End: len("state.Factory")}},
				{Path: "Other", Range: ByteRange{Start: len("state.Factory.build("), End: len("state.Factory.build(state.Other")}},
			},
		},
		{
			name:       "lambda state binding shadows generated state",
			expression: "(lambda state: state.Producer)(value)",
			want:       nil,
		},
		{
			name:       "comprehension binding shadows body but not iterable",
			expression: "[state.Producer for state in state.Items]",
			want: []pythonStateReference{{
				Path:  "Items",
				Range: ByteRange{Start: len("[state.Producer for state in "), End: len("[state.Producer for state in state.Items")},
			}},
		},
		{
			name:       "strings and comments are ignored",
			expression: "'state.Producer'  # state.Consumer",
			want:       nil,
		},
		{
			name:       "incomplete syntax contributes no references",
			expression: "state.Producer +",
			want:       nil,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			got, err := findPythonStateReferences(test.expression)
			if err != nil {
				t.Fatalf("findPythonStateReferences() error = %v", err)
			}
			if len(got) != len(test.want) {
				t.Fatalf("references = %#v, want %#v", got, test.want)
			}
			for index := range test.want {
				if got[index] != test.want[index] {
					t.Fatalf("reference %d = %#v, want %#v", index, got[index], test.want[index])
				}
				if value := test.expression[got[index].Range.Start:got[index].Range.End]; value != "state."+got[index].Path {
					t.Fatalf("reference %d range selected %q", index, value)
				}
			}
		})
	}
}
