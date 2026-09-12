package worker

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
	"sync"
)

const (
	DefaultMaximumFrameBytes = 4 << 20
	maximumHeaderBytes       = 8 << 10
)

var (
	ErrFrameMalformed = errors.New("worker: frame is malformed")
	ErrFrameTooLarge  = errors.New("worker: frame exceeds the byte limit")
)

type Framer struct {
	reader  *bufio.Reader
	writer  io.Writer
	maximum int
	writeMu sync.Mutex
}

func NewFramer(reader io.Reader, writer io.Writer, maximum int) (*Framer, error) {
	if reader == nil {
		return nil, errors.New("worker: frame reader is required")
	}
	if writer == nil {
		return nil, errors.New("worker: frame writer is required")
	}
	if maximum == 0 {
		maximum = DefaultMaximumFrameBytes
	}
	if maximum < 1 {
		return nil, errors.New("worker: frame byte limit must be positive")
	}
	return &Framer{
		reader:  bufio.NewReaderSize(reader, maximumHeaderBytes+1),
		writer:  writer,
		maximum: maximum,
	}, nil
}

func (framer *Framer) Read() ([]byte, error) {
	if framer == nil || framer.reader == nil {
		return nil, errors.New("worker: frame reader is unavailable")
	}
	contentLength, err := framer.readContentLength()
	if err != nil {
		return nil, err
	}
	if contentLength > framer.maximum {
		return nil, fmt.Errorf("%w: %d > %d", ErrFrameTooLarge, contentLength, framer.maximum)
	}
	body := make([]byte, contentLength)
	if _, err := io.ReadFull(framer.reader, body); err != nil {
		return nil, err
	}
	return body, nil
}

func (framer *Framer) readContentLength() (int, error) {
	contentLength := -1
	headerBytes := 0
	for {
		line, err := framer.readHeaderLine(&headerBytes)
		if err != nil {
			return 0, err
		}
		if len(line) == 0 {
			break
		}
		contentLength, err = acceptContentLength(line, contentLength)
		if err != nil {
			return 0, err
		}
	}
	if contentLength < 0 {
		return 0, fmt.Errorf("%w: Content-Length is required", ErrFrameMalformed)
	}
	return contentLength, nil
}

func (framer *Framer) readHeaderLine(headerBytes *int) ([]byte, error) {
	line, err := framer.reader.ReadSlice('\n')
	*headerBytes += len(line)
	if errors.Is(err, bufio.ErrBufferFull) || *headerBytes > maximumHeaderBytes {
		return nil, fmt.Errorf("%w: header exceeds the byte limit", ErrFrameMalformed)
	}
	if err != nil {
		return nil, err
	}
	if len(line) < 2 || line[len(line)-2] != '\r' {
		return nil, fmt.Errorf("%w: header line does not use CRLF", ErrFrameMalformed)
	}
	return line[:len(line)-2], nil
}

func acceptContentLength(line []byte, current int) (int, error) {
	key, value, found := strings.Cut(string(line), ":")
	if !found || !strings.EqualFold(key, "Content-Length") {
		return 0, fmt.Errorf("%w: unsupported header", ErrFrameMalformed)
	}
	if current >= 0 {
		return 0, fmt.Errorf("%w: repeated Content-Length", ErrFrameMalformed)
	}
	return parseContentLength(value)
}

func parseContentLength(value string) (int, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0, fmt.Errorf("%w: Content-Length is empty", ErrFrameMalformed)
	}
	for _, character := range value {
		if character < '0' || character > '9' {
			return 0, fmt.Errorf("%w: Content-Length is not decimal", ErrFrameMalformed)
		}
	}
	parsed, err := strconv.ParseUint(value, 10, 31)
	if err != nil || parsed == 0 {
		return 0, fmt.Errorf("%w: Content-Length is invalid", ErrFrameMalformed)
	}
	return int(parsed), nil
}

func (framer *Framer) Write(body []byte) error {
	if framer == nil || framer.writer == nil {
		return errors.New("worker: frame writer is unavailable")
	}
	if len(body) == 0 {
		return fmt.Errorf("%w: body is empty", ErrFrameMalformed)
	}
	if len(body) > framer.maximum {
		return fmt.Errorf("%w: %d > %d", ErrFrameTooLarge, len(body), framer.maximum)
	}
	header := []byte(fmt.Sprintf("Content-Length: %d\r\n\r\n", len(body)))
	framer.writeMu.Lock()
	defer framer.writeMu.Unlock()
	if err := writeFull(framer.writer, header); err != nil {
		return fmt.Errorf("worker: write frame header: %w", err)
	}
	if err := writeFull(framer.writer, body); err != nil {
		return fmt.Errorf("worker: write frame body: %w", err)
	}
	return nil
}

func writeFull(writer io.Writer, content []byte) error {
	for len(content) > 0 {
		count, err := writer.Write(content)
		if count > 0 {
			content = content[count:]
		}
		if err != nil {
			return err
		}
		if count == 0 {
			return io.ErrShortWrite
		}
	}
	return nil
}
