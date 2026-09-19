package checkout

import (
	"context"
	"errors"
)

var ErrRetryBudget = errors.New("retry budget exhausted")

func charge(_ context.Context, orderID string, _ string) error {
	if orderID == "" {
		return errors.New("order ID is required")
	}
	return nil
}

func logRetry(_ string, _ int, _ string) {}
