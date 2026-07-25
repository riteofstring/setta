package runtimebackup

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
)

const (
	envelopeMagic      = "SETTAE01"
	envelopeHeaderSize = len(envelopeMagic) + 32 + 4
	envelopeChunkSize  = 64 * 1024
	frameHeaderSize    = 1 + 8 + 4
	frameData          = byte(1)
	frameFinal         = byte(2)
)

var (
	// ErrInvalidKey identifies a key that is not an AES-256 master key.
	ErrInvalidKey = errors.New("invalid runtime backup key")
	// ErrInvalidEnvelope identifies corrupt, truncated, reordered, or otherwise
	// unauthenticated encrypted backup framing.
	ErrInvalidEnvelope = errors.New("invalid runtime backup envelope")
)

// Key is a caller-managed user-scoped AES-256 master key. The backup package
// never persists or logs it.
type Key [32]byte

type encryptWriter struct {
	destination io.Writer
	aead        cipher.AEAD
	header      []byte
	buffer      []byte
	counter     uint64
	closed      bool
}

// NewEncryptWriter creates a chunked authenticated stream with a unique
// per-export subkey. Close must be called to write the authenticated final
// record.
func NewEncryptWriter(destination io.Writer, key Key) (io.WriteCloser, error) {
	if destination == nil || key == (Key{}) {
		return nil, ErrInvalidKey
	}
	salt := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return nil, fmt.Errorf("generate backup salt: %w", err)
	}
	header := make([]byte, envelopeHeaderSize)
	copy(header, envelopeMagic)
	copy(header[len(envelopeMagic):], salt)
	binary.BigEndian.PutUint32(header[len(envelopeMagic)+len(salt):], envelopeChunkSize)
	aead, err := newEnvelopeAEAD(key, salt)
	if err != nil {
		return nil, err
	}
	if err := writeAll(destination, header); err != nil {
		return nil, err
	}
	return &encryptWriter{
		destination: destination,
		aead:        aead,
		header:      header,
		buffer:      make([]byte, 0, envelopeChunkSize),
	}, nil
}

func (writer *encryptWriter) Write(data []byte) (int, error) {
	if writer.closed {
		return 0, ErrInvalidEnvelope
	}
	written := 0
	for len(data) > 0 {
		space := envelopeChunkSize - len(writer.buffer)
		count := min(space, len(data))
		writer.buffer = append(writer.buffer, data[:count]...)
		data = data[count:]
		written += count
		if len(writer.buffer) == envelopeChunkSize {
			if err := writer.writeFrame(frameData, writer.buffer); err != nil {
				return written, err
			}
			writer.buffer = writer.buffer[:0]
		}
	}
	return written, nil
}

func (writer *encryptWriter) Close() error {
	if writer.closed {
		return ErrInvalidEnvelope
	}
	writer.closed = true
	if len(writer.buffer) > 0 {
		if err := writer.writeFrame(frameData, writer.buffer); err != nil {
			return err
		}
	}
	return writer.writeFrame(frameFinal, nil)
}

func (writer *encryptWriter) writeFrame(kind byte, plaintext []byte) error {
	if writer.counter == ^uint64(0) {
		return ErrInvalidEnvelope
	}
	frameHeader := make([]byte, frameHeaderSize)
	frameHeader[0] = kind
	binary.BigEndian.PutUint64(frameHeader[1:9], writer.counter)
	binary.BigEndian.PutUint32(frameHeader[9:13], uint32(len(plaintext)))
	nonce := envelopeNonce(writer.counter)
	aad := make([]byte, 0, len(writer.header)+len(frameHeader))
	aad = append(aad, writer.header...)
	aad = append(aad, frameHeader...)
	ciphertext := writer.aead.Seal(nil, nonce, plaintext, aad)
	if err := writeAll(writer.destination, frameHeader); err != nil {
		return err
	}
	if err := writeAll(writer.destination, ciphertext); err != nil {
		return err
	}
	writer.counter++
	return nil
}

type decryptReader struct {
	source    io.Reader
	aead      cipher.AEAD
	header    []byte
	chunkSize uint32
	counter   uint64
	buffer    []byte
	final     bool
}

// NewDecryptReader authenticates an encrypted backup stream. Callers must read
// through EOF so the final record and absence of trailing bytes are verified.
func NewDecryptReader(source io.Reader, key Key) (io.Reader, error) {
	if source == nil || key == (Key{}) {
		return nil, ErrInvalidKey
	}
	header := make([]byte, envelopeHeaderSize)
	if _, err := io.ReadFull(source, header); err != nil {
		return nil, fmt.Errorf("%w: header: %v", ErrInvalidEnvelope, err)
	}
	if string(header[:len(envelopeMagic)]) != envelopeMagic {
		return nil, fmt.Errorf("%w: magic", ErrInvalidEnvelope)
	}
	chunkSize := binary.BigEndian.Uint32(header[envelopeHeaderSize-4:])
	if chunkSize != envelopeChunkSize {
		return nil, fmt.Errorf("%w: chunk size", ErrInvalidEnvelope)
	}
	salt := header[len(envelopeMagic) : len(envelopeMagic)+32]
	aead, err := newEnvelopeAEAD(key, salt)
	if err != nil {
		return nil, err
	}
	return &decryptReader{source: source, aead: aead, header: header, chunkSize: chunkSize}, nil
}

func (reader *decryptReader) Read(destination []byte) (int, error) {
	if len(destination) == 0 {
		return 0, nil
	}
	for len(reader.buffer) == 0 && !reader.final {
		if err := reader.readFrame(); err != nil {
			return 0, err
		}
	}
	if len(reader.buffer) == 0 && reader.final {
		return 0, io.EOF
	}
	count := copy(destination, reader.buffer)
	reader.buffer = reader.buffer[count:]
	return count, nil
}

func (reader *decryptReader) readFrame() error {
	frameHeader := make([]byte, frameHeaderSize)
	if _, err := io.ReadFull(reader.source, frameHeader); err != nil {
		return fmt.Errorf("%w: frame header: %v", ErrInvalidEnvelope, err)
	}
	kind := frameHeader[0]
	counter := binary.BigEndian.Uint64(frameHeader[1:9])
	length := binary.BigEndian.Uint32(frameHeader[9:13])
	if !reader.validFrameMetadata(kind, counter, length) {
		return fmt.Errorf("%w: frame metadata", ErrInvalidEnvelope)
	}
	plaintext, err := reader.decryptFrame(frameHeader, counter, length)
	if err != nil {
		return err
	}
	reader.counter++
	if kind == frameFinal {
		if err := requireEnvelopeEOF(reader.source); err != nil {
			return err
		}
		reader.final = true
		return nil
	}
	reader.buffer = plaintext
	return nil
}

func (reader *decryptReader) validFrameMetadata(kind byte, counter uint64, length uint32) bool {
	if counter != reader.counter || length > reader.chunkSize {
		return false
	}
	if kind == frameData {
		return length != 0
	}
	return kind == frameFinal && length == 0
}

func (reader *decryptReader) decryptFrame(frameHeader []byte, counter uint64, length uint32) ([]byte, error) {
	ciphertext := make([]byte, int(length)+reader.aead.Overhead())
	if _, err := io.ReadFull(reader.source, ciphertext); err != nil {
		return nil, fmt.Errorf("%w: frame body: %v", ErrInvalidEnvelope, err)
	}
	aad := make([]byte, 0, len(reader.header)+len(frameHeader))
	aad = append(aad, reader.header...)
	aad = append(aad, frameHeader...)
	plaintext, err := reader.aead.Open(nil, envelopeNonce(counter), ciphertext, aad)
	if err != nil {
		return nil, fmt.Errorf("%w: authenticate frame", ErrInvalidEnvelope)
	}
	return plaintext, nil
}

func requireEnvelopeEOF(source io.Reader) error {
	var trailing [1]byte
	for {
		count, err := source.Read(trailing[:])
		if count != 0 {
			return fmt.Errorf("%w: trailing data", ErrInvalidEnvelope)
		}
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("%w: trailing data: %v", ErrInvalidEnvelope, err)
		}
	}
}

func newEnvelopeAEAD(key Key, salt []byte) (cipher.AEAD, error) {
	derived, err := hkdf.Key(sha256.New, key[:], salt, "setta-runtime-export-v1", 32)
	if err != nil {
		return nil, fmt.Errorf("derive backup key: %w", err)
	}
	block, err := aes.NewCipher(derived)
	if err != nil {
		return nil, fmt.Errorf("create backup cipher: %w", err)
	}
	return cipher.NewGCM(block)
}

func envelopeNonce(counter uint64) []byte {
	nonce := make([]byte, 12)
	binary.BigEndian.PutUint64(nonce[4:], counter)
	return nonce
}

func writeAll(destination io.Writer, data []byte) error {
	for len(data) > 0 {
		count, err := destination.Write(data)
		if err != nil {
			return err
		}
		if count <= 0 {
			return io.ErrShortWrite
		}
		data = data[count:]
	}
	return nil
}
