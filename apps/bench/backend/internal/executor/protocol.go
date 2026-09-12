package executor

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"

	"github.com/setta/bench/backend/internal/contracts"
)

type parsedProtocol struct {
	result  contracts.CandidateResultV1
	failure *contracts.StructuredErrorV1
}

var errProtocolOutputLimit = errors.New("executor: candidate protocol output exceeded its byte limit")

type protocolState struct {
	parsed       parsedProtocol
	terminal     bool
	lastProgress float64
	messageCount int
}

type protocolCapture struct {
	parsed parsedProtocol
	err    error
}

type signalingLimitReader struct {
	reader    io.Reader
	remaining int
	violation chan<- error
	exceeded  bool
}

func streamMessages(reader io.Reader, progress ProgressFunc, violation chan<- error) <-chan protocolCapture {
	result := make(chan protocolCapture, 1)
	go func() {
		state := protocolState{}
		bounded := &signalingLimitReader{reader: reader, remaining: maximumStdoutBytes, violation: violation}
		scanner := bufio.NewScanner(bounded)
		scanner.Buffer(make([]byte, 64<<10), maximumStdoutBytes+1)
		for scanner.Scan() {
			if err := state.accept(scanner.Bytes(), progress); err != nil {
				signalProtocolViolation(violation, err)
				result <- protocolCapture{err: err}
				return
			}
		}
		if err := scanner.Err(); err != nil {
			if bounded.exceeded {
				err = errProtocolOutputLimit
			}
			signalProtocolViolation(violation, err)
			result <- protocolCapture{err: err}
			return
		}
		if state.messageCount == 0 || !state.terminal {
			err := errors.New("executor: candidate emitted no terminal message")
			signalProtocolViolation(violation, err)
			result <- protocolCapture{err: err}
			return
		}
		result <- protocolCapture{parsed: state.parsed}
	}()
	return result
}

func (reader *signalingLimitReader) Read(buffer []byte) (int, error) {
	if reader.exceeded {
		return 0, errProtocolOutputLimit
	}
	if len(buffer) > reader.remaining+1 {
		buffer = buffer[:reader.remaining+1]
	}
	count, err := reader.reader.Read(buffer)
	reader.remaining -= count
	if reader.remaining < 0 {
		reader.exceeded = true
		signalProtocolViolation(reader.violation, errProtocolOutputLimit)
	}
	return count, err
}

func (state *protocolState) accept(line []byte, progress ProgressFunc) error {
	if err := state.admitLine(line); err != nil {
		return err
	}
	typeName, err := protocolMessageType(line, state.messageCount)
	if err != nil {
		return err
	}
	switch typeName {
	case "progress":
		return state.acceptProgress(line, progress)
	case "result":
		return state.acceptResult(line)
	case "error":
		return state.acceptError(line)
	default:
		return errors.New("executor: candidate message type is invalid")
	}
}

func (state *protocolState) admitLine(line []byte) error {
	state.messageCount++
	if state.messageCount > maximumMessages {
		return errors.New("executor: candidate message count is invalid")
	}
	if len(line) == 0 {
		return errors.New("executor: candidate emitted a blank protocol message")
	}
	if state.terminal {
		return errors.New("executor: candidate emitted a message after its terminal message")
	}
	return nil
}

func protocolMessageType(line []byte, index int) (string, error) {
	var discriminator struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(line, &discriminator); err != nil {
		return "", fmt.Errorf("executor: decode message %d: %w", index, err)
	}
	return discriminator.Type, nil
}

func (state *protocolState) acceptProgress(line []byte, progress ProgressFunc) error {
	var message contracts.CandidateProgressV1
	if err := contracts.DecodeStrict(line, &message); err != nil {
		return err
	}
	if err := message.Validate(); err != nil {
		return err
	}
	if message.Progress < state.lastProgress {
		return errors.New("executor: candidate progress regressed")
	}
	state.lastProgress = message.Progress
	if progress != nil {
		progress(message.Progress, message.Message)
	}
	return nil
}

func (state *protocolState) acceptResult(line []byte) error {
	var message contracts.CandidateResultV1
	if err := contracts.DecodeStrict(line, &message); err != nil {
		return err
	}
	if err := message.Validate(); err != nil {
		return err
	}
	state.parsed.result = message
	state.terminal = true
	return nil
}

func (state *protocolState) acceptError(line []byte) error {
	var message contracts.CandidateErrorV1
	if err := contracts.DecodeStrict(line, &message); err != nil {
		return err
	}
	if err := message.Validate(); err != nil {
		return err
	}
	state.parsed.failure = &contracts.StructuredErrorV1{Code: message.Code, Message: message.Message}
	state.terminal = true
	return nil
}

func signalProtocolViolation(channel chan<- error, err error) {
	if channel == nil || err == nil {
		return
	}
	select {
	case channel <- err:
	default:
	}
}
