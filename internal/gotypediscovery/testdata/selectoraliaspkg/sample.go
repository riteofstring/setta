package selectoraliaspkg

import (
	"net/http"
	"time"
)

type HeaderAlias = http.Header

type HeaderNamed http.Header

type TimeAlias = time.Time

type TimeNamed time.Time
