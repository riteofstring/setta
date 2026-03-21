package realtime

import (
	"encoding/binary"
	"encoding/json"
	"errors"
)

const binaryHeaderLengthBytes = 4

var (
	ErrBinaryFrameTooShort        = errors.New("realtime: binary frame too short to include header length")
	ErrBinaryFrameHeaderPartial   = errors.New("realtime: binary frame header is incomplete")
	ErrBinaryFrameHeaderJSON      = errors.New("realtime: binary frame header is not valid JSON")
	ErrBinaryFrameHeaderNotObject = errors.New("realtime: binary frame header must be a JSON object")
)

func EncodeBinaryFrame(header any, payload []byte) ([]byte, error) {
	headerBytes, err := json.Marshal(header)
	if err != nil {
		return nil, err
	}

	frame := make([]byte, binaryHeaderLengthBytes+len(headerBytes)+len(payload))
	binary.BigEndian.PutUint32(frame[:binaryHeaderLengthBytes], uint32(len(headerBytes)))
	copy(frame[binaryHeaderLengthBytes:], headerBytes)
	copy(frame[binaryHeaderLengthBytes+len(headerBytes):], payload)
	return frame, nil
}

func DecodeBinaryFrame(data []byte) (json.RawMessage, []byte, error) {
	if len(data) < binaryHeaderLengthBytes {
		return nil, nil, ErrBinaryFrameTooShort
	}

	headerLength := int(binary.BigEndian.Uint32(data[:binaryHeaderLengthBytes]))
	headerEnd := binaryHeaderLengthBytes + headerLength
	if len(data) < headerEnd {
		return nil, nil, ErrBinaryFrameHeaderPartial
	}

	header := append(json.RawMessage(nil), data[binaryHeaderLengthBytes:headerEnd]...)
	var decoded any
	if err := json.Unmarshal(header, &decoded); err != nil {
		return nil, nil, ErrBinaryFrameHeaderJSON
	}
	if _, ok := decoded.(map[string]any); !ok {
		return nil, nil, ErrBinaryFrameHeaderNotObject
	}

	payload := make([]byte, len(data[headerEnd:]))
	copy(payload, data[headerEnd:])
	return header, payload, nil
}
