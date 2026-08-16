package main

import (
	"errors"
	"testing"
)

func TestRunPassesRequestedPortToLoopbackServer(t *testing.T) {
	var received uint16
	err := run([]string{"-port", "0"}, func(port uint16) error {
		received = port
		return nil
	})
	if err != nil {
		t.Fatalf("run() error = %v", err)
	}
	if received != 0 {
		t.Fatalf("port = %d, want 0", received)
	}
}

func TestRunRejectsOutOfRangePortAndPositionalArguments(t *testing.T) {
	for _, arguments := range [][]string{{"-port", "65536"}, {"unexpected"}} {
		err := run(arguments, func(uint16) error {
			return errors.New("server must not start")
		})
		if err == nil {
			t.Fatalf("run(%q) error = nil", arguments)
		}
	}
}
