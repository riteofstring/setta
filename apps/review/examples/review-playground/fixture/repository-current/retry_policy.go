package checkout

import (
	"context"
	"fmt"
	"time"
)

type RetryRequest struct {
	OrderID string
	Attempt int
}

func RetryPayment(ctx context.Context, request RetryRequest) error {
	if request.Attempt > 3 {
		return ErrRetryBudget
	}
	idempotencyKey := fmt.Sprintf("checkout:%s", request.OrderID)
	logRetry(request.OrderID, request.Attempt, idempotencyKey)
	time.Sleep(time.Duration(request.Attempt) * 50 * time.Millisecond)
	return charge(ctx, request.OrderID, idempotencyKey)
}
