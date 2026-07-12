package tokenestimate

import (
	"errors"
	"fmt"
	"sync"
	"unicode/utf8"

	"github.com/tiktoken-go/tokenizer"
)

var (
	o200kCodec     tokenizer.Codec
	o200kCodecErr  error
	o200kCodecOnce sync.Once
)

// Count returns an o200k_base token count for model input or output text.
// Setta uses one explicit encoding for its audit estimates so unknown catalog
// model names cannot silently select a heuristic or byte-ratio fallback.
func Count(text string) (int, error) {
	if text == "" {
		return 0, nil
	}
	if !utf8.ValidString(text) {
		return 0, errors.New("token estimate input must be valid UTF-8")
	}
	codec, err := loadO200KCodec()
	if err != nil {
		return 0, fmt.Errorf("load o200k_base tokenizer: %w", err)
	}
	count, err := codec.Count(text)
	if err != nil {
		return 0, fmt.Errorf("count o200k_base tokens: %w", err)
	}
	if count <= 0 {
		return 0, errors.New("non-empty token estimate input produced no tokens")
	}
	return count, nil
}

func loadO200KCodec() (tokenizer.Codec, error) {
	o200kCodecOnce.Do(func() {
		o200kCodec, o200kCodecErr = tokenizer.Get(tokenizer.O200kBase)
	})
	return o200kCodec, o200kCodecErr
}

func CountBytes(value []byte) (int, error) {
	if len(value) == 0 {
		return 0, nil
	}
	if !utf8.Valid(value) {
		return 0, errors.New("token estimate input must be valid UTF-8")
	}
	return Count(string(value))
}
