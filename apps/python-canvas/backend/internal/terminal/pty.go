package terminal

import (
	"io"
)

type ptySession interface {
	io.Reader
	io.Writer
	Resize(columns int, rows int) error
	Close() error
	Wait() error
}
