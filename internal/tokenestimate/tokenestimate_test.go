package tokenestimate

import "testing"

func TestCountUsesO200KTokenization(t *testing.T) {
	tests := []struct {
		text string
		want int
	}{
		{text: "Hello, world!", want: 4},
		{text: "你好世界！", want: 3},
		{text: "こんにちは世界！", want: 3},
	}
	for _, test := range tests {
		got, err := Count(test.text)
		if err != nil {
			t.Fatalf("Count(%q): %v", test.text, err)
		}
		if got != test.want {
			t.Fatalf("Count(%q) = %d, want %d", test.text, got, test.want)
		}
	}
}

func TestCountRejectsInvalidUTF8(t *testing.T) {
	if _, err := CountBytes([]byte{0xff}); err == nil {
		t.Fatal("CountBytes accepted invalid UTF-8")
	}
}
