package unifiedenv

import (
	"fmt"
	"os"
	"testing"

	"github.com/setta/python-canvas/backend/internal/terminal"
)

func TestMain(m *testing.M) {
	if handled, err := terminal.RunPrivatePTYGuardian(os.Args[1:]); handled {
		if err != nil {
			_, _ = fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		os.Exit(0)
	}
	os.Exit(m.Run())
}
