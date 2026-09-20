package strictjson

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"unicode/utf8"
)

const (
	MaximumBytes      = 64 << 20
	MaximumDepth      = 32
	MaximumTokenBytes = 8 << 20
)

var (
	ErrInvalidUTF8    = errors.New("strictjson: document is not valid UTF-8")
	ErrMaximumSize    = errors.New("strictjson: document exceeds the size limit")
	ErrMaximumDepth   = errors.New("strictjson: document exceeds the nesting limit")
	ErrMaximumToken   = errors.New("strictjson: token exceeds the size limit")
	ErrMultipleValues = errors.New("strictjson: document contains multiple JSON values")
)

func Decode(data []byte, target any) error {
	if err := Validate(data); err != nil {
		return err
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	return decoder.Decode(target)
}

func Validate(data []byte) error {
	if len(data) > MaximumBytes {
		return ErrMaximumSize
	}
	if !utf8.Valid(data) {
		return ErrInvalidUTF8
	}
	if err := validate(data, MaximumDepth, MaximumTokenBytes); err != nil {
		return err
	}
	return nil
}

func validate(data []byte, maximumDepth int, maximumTokenBytes int) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	if err := consumeValue(decoder, 0, maximumDepth, maximumTokenBytes); err != nil {
		return err
	}
	if _, err := decoder.Token(); !errors.Is(err, io.EOF) {
		if err == nil {
			return ErrMultipleValues
		}
		return err
	}
	return nil
}

func consumeValue(decoder *json.Decoder, depth int, maximumDepth int, maximumTokenBytes int) error {
	token, err := decoder.Token()
	if err != nil {
		return err
	}
	if err := validateToken(token, maximumTokenBytes); err != nil {
		return err
	}
	delimiter, compound := token.(json.Delim)
	if !compound {
		return nil
	}
	if depth >= maximumDepth {
		return ErrMaximumDepth
	}
	switch delimiter {
	case '{':
		return consumeObject(decoder, depth+1, maximumDepth, maximumTokenBytes)
	case '[':
		return consumeArray(decoder, depth+1, maximumDepth, maximumTokenBytes)
	default:
		return errors.New("strictjson: compound value is invalid")
	}
}

func consumeObject(decoder *json.Decoder, depth int, maximumDepth int, maximumTokenBytes int) error {
	fields := make(map[string]struct{})
	for decoder.More() {
		nameToken, err := decoder.Token()
		if err != nil {
			return err
		}
		name, ok := nameToken.(string)
		if !ok {
			return errors.New("strictjson: object field name is invalid")
		}
		if len(name) > maximumTokenBytes {
			return ErrMaximumToken
		}
		if _, exists := fields[name]; exists {
			return fmt.Errorf("strictjson: object repeats field %q", name)
		}
		fields[name] = struct{}{}
		if err := consumeValue(decoder, depth, maximumDepth, maximumTokenBytes); err != nil {
			return err
		}
	}
	return consumeClosingDelimiter(decoder, '}')
}

func consumeArray(decoder *json.Decoder, depth int, maximumDepth int, maximumTokenBytes int) error {
	for decoder.More() {
		if err := consumeValue(decoder, depth, maximumDepth, maximumTokenBytes); err != nil {
			return err
		}
	}
	return consumeClosingDelimiter(decoder, ']')
}

func consumeClosingDelimiter(decoder *json.Decoder, expected byte) error {
	closing, err := decoder.Token()
	if err != nil {
		return err
	}
	if closing != json.Delim(expected) {
		return errors.New("strictjson: compound value is not closed")
	}
	return nil
}

func validateToken(token json.Token, maximum int) error {
	var size int
	switch value := token.(type) {
	case string:
		size = len(value)
	case json.Number:
		size = len(value.String())
	}
	if size > maximum {
		return ErrMaximumToken
	}
	return nil
}
