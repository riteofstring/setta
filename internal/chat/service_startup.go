package chat

import "fmt"

func (service *Service) ensureEventHub() error {
	if service.events == nil {
		streamID, err := service.newID("event_stream")
		if err != nil {
			return fmt.Errorf("create event stream id: %w", err)
		}
		events, err := NewEventHub(streamID, WithEventClock(service.now))
		if err != nil {
			return err
		}
		service.events = events
	}
	return nil
}

func (service *Service) recoverStartupState() error {
	if err := service.recoverInterruptedRuns(); err != nil {
		service.recordCorruptStateDiagnostic(err, "", "", "")
		return err
	}
	if err := service.recoverBackgroundTerminals(); err != nil {
		service.recordCorruptStateDiagnostic(err, "", "", "")
		return err
	}
	return nil
}
