package runs

import (
	"context"
	"testing"

	binarypayload "setta/internal/binary"
)

func TestServiceApplyDrawSnapshotsNoopsWhenNoRefs(t *testing.T) {
	t.Parallel()

	var service Service

	testCases := []struct {
		name string
		refs map[string]binarypayload.ContentRef
	}{
		{
			name: "nil map",
			refs: nil,
		},
		{
			name: "empty map",
			refs: map[string]binarypayload.ContentRef{},
		},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			err := service.applyDrawSnapshots(
				context.Background(),
				nil,
				t.TempDir(),
				"project-alpha",
				"",
				testCase.refs,
			)
			if err != nil {
				t.Fatalf("apply draw snapshots: %v", err)
			}
		})
	}
}
