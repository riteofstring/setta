package runtimebackup

import (
	"bytes"
	"encoding/binary"
	"errors"
	"io"
	"testing"
)

func TestEnvelopeRoundTripEmptyAndMultiChunk(t *testing.T) {
	key := testKey(1)
	for name, plaintext := range map[string][]byte{
		"empty":       nil,
		"multi chunk": bytes.Repeat([]byte("setta"), envelopeChunkSize/2+17_000),
	} {
		t.Run(name, func(t *testing.T) {
			ciphertext := encryptForTest(t, key, plaintext)
			decrypted, err := NewDecryptReader(bytes.NewReader(ciphertext), key)
			if err != nil {
				t.Fatalf("NewDecryptReader: %v", err)
			}
			actual, err := io.ReadAll(decrypted)
			if err != nil {
				t.Fatalf("ReadAll: %v", err)
			}
			if !bytes.Equal(actual, plaintext) {
				t.Fatalf("round trip length=%d, want %d", len(actual), len(plaintext))
			}
		})
	}
}

func TestEnvelopeRejectsReorderedFramesAndFinalRecordTampering(t *testing.T) {
	key := testKey(11)
	ciphertext := encryptForTest(t, key, bytes.Repeat([]byte("f"), envelopeChunkSize*2+1))
	frames := splitEnvelopeFrames(t, ciphertext)
	if len(frames) < 4 {
		t.Fatalf("frame count = %d, want at least 4", len(frames))
	}
	reordered := append([]byte(nil), ciphertext[:envelopeHeaderSize]...)
	reordered = append(reordered, frames[1]...)
	reordered = append(reordered, frames[0]...)
	for _, frame := range frames[2:] {
		reordered = append(reordered, frame...)
	}
	tamperedFinal := append([]byte(nil), ciphertext...)
	tamperedFinal[len(tamperedFinal)-1] ^= 0x20
	for name, artifact := range map[string][]byte{
		"reordered":    reordered,
		"final tamper": tamperedFinal,
	} {
		t.Run(name, func(t *testing.T) {
			reader, err := NewDecryptReader(bytes.NewReader(artifact), key)
			if err == nil {
				_, err = io.ReadAll(reader)
			}
			if !errors.Is(err, ErrInvalidEnvelope) {
				t.Fatalf("error = %v, want ErrInvalidEnvelope", err)
			}
		})
	}
}

func TestEnvelopeFinalCheckToleratesZeroLengthRead(t *testing.T) {
	ciphertext := encryptForTest(t, testKey(14), []byte("content"))
	source := &zeroBeforeEOFReader{reader: bytes.NewReader(ciphertext)}
	reader, err := NewDecryptReader(source, testKey(14))
	if err != nil {
		t.Fatalf("NewDecryptReader: %v", err)
	}
	plaintext, err := io.ReadAll(reader)
	if err != nil {
		t.Fatalf("ReadAll: %v", err)
	}
	if !bytes.Equal(plaintext, []byte("content")) {
		t.Fatalf("plaintext = %q", plaintext)
	}
}

type zeroBeforeEOFReader struct {
	reader   *bytes.Reader
	returned bool
}

func (reader *zeroBeforeEOFReader) Read(destination []byte) (int, error) {
	if reader.reader.Len() == 0 && !reader.returned {
		reader.returned = true
		return 0, nil
	}
	return reader.reader.Read(destination)
}

func splitEnvelopeFrames(t *testing.T, ciphertext []byte) [][]byte {
	t.Helper()
	frames := make([][]byte, 0)
	for offset := envelopeHeaderSize; offset < len(ciphertext); {
		if len(ciphertext)-offset < frameHeaderSize {
			t.Fatalf("truncated frame header")
		}
		length := int(binary.BigEndian.Uint32(ciphertext[offset+9 : offset+13]))
		end := offset + frameHeaderSize + length + 16
		if end > len(ciphertext) {
			t.Fatalf("truncated frame body")
		}
		frames = append(frames, append([]byte(nil), ciphertext[offset:end]...))
		offset = end
	}
	return frames
}

func TestEnvelopeRejectsWrongKeyCorruptionTruncationAndTrailingData(t *testing.T) {
	key := testKey(2)
	ciphertext := encryptForTest(t, key, bytes.Repeat([]byte("evidence"), 20_000))

	tests := map[string][]byte{
		"header tamper": append([]byte(nil), ciphertext...),
		"body tamper":   append([]byte(nil), ciphertext...),
		"truncated":     append([]byte(nil), ciphertext[:len(ciphertext)-1]...),
		"trailing":      append(append([]byte(nil), ciphertext...), 1),
	}
	tests["header tamper"][len(envelopeMagic)] ^= 0x40
	tests["body tamper"][envelopeHeaderSize+frameHeaderSize] ^= 0x40

	for name, damaged := range tests {
		t.Run(name, func(t *testing.T) {
			reader, err := NewDecryptReader(bytes.NewReader(damaged), key)
			if err == nil {
				_, err = io.ReadAll(reader)
			}
			if !errors.Is(err, ErrInvalidEnvelope) {
				t.Fatalf("error = %v, want ErrInvalidEnvelope", err)
			}
		})
	}

	reader, err := NewDecryptReader(bytes.NewReader(ciphertext), testKey(3))
	if err != nil {
		t.Fatalf("NewDecryptReader wrong key: %v", err)
	}
	if _, err := io.ReadAll(reader); !errors.Is(err, ErrInvalidEnvelope) {
		t.Fatalf("wrong-key error = %v, want ErrInvalidEnvelope", err)
	}
}

func encryptForTest(t *testing.T, key Key, plaintext []byte) []byte {
	t.Helper()
	var encrypted bytes.Buffer
	writer, err := NewEncryptWriter(&encrypted, key)
	if err != nil {
		t.Fatalf("NewEncryptWriter: %v", err)
	}
	if _, err := writer.Write(plaintext); err != nil {
		t.Fatalf("Write: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
	return encrypted.Bytes()
}

func testKey(seed byte) Key {
	var key Key
	for index := range key {
		key[index] = seed + byte(index)
	}
	return key
}
