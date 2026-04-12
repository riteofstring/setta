package valueconvert

import "testing"

func TestFloat64AcceptsNumericValues(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name  string
		value any
		want  float64
	}{
		{name: "float64", value: float64(1.5), want: 1.5},
		{name: "float32", value: float32(2.5), want: 2.5},
		{name: "int", value: int(-3), want: -3},
		{name: "int8", value: int8(-4), want: -4},
		{name: "int16", value: int16(-5), want: -5},
		{name: "int32", value: int32(-6), want: -6},
		{name: "int64", value: int64(-7), want: -7},
		{name: "uint", value: uint(8), want: 8},
		{name: "uint8", value: uint8(9), want: 9},
		{name: "uint16", value: uint16(10), want: 10},
		{name: "uint32", value: uint32(11), want: 11},
		{name: "uint64", value: uint64(12), want: 12},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got, ok := Float64(tc.value)
			if !ok {
				t.Fatalf("expected %T to convert", tc.value)
			}
			if got != tc.want {
				t.Fatalf("expected %v, got %v", tc.want, got)
			}
		})
	}
}

func TestFloat64RejectsNonNumericValues(t *testing.T) {
	t.Parallel()

	for _, value := range []any{nil, "3", true, []int{1}} {
		if got, ok := Float64(value); ok {
			t.Fatalf("expected %#v to fail conversion, got %v", value, got)
		}
	}
}
