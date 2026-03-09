package ai

import (
	"fmt"
	"time"
)

const defaultChunkTimeout = 30 * time.Second

// TimeoutStreamReader wraps a StreamReader with a per-chunk timeout.
// If no chunk arrives within the timeout, the stream is closed and an error is returned.
type TimeoutStreamReader struct {
	inner   StreamReader
	timeout time.Duration
	ch      chan nextResult
	done    chan struct{}
}

type nextResult struct {
	delta *StreamDelta
	err   error
}

// NewTimeoutStreamReader wraps a StreamReader with a per-chunk timeout.
func NewTimeoutStreamReader(inner StreamReader, timeout time.Duration) *TimeoutStreamReader {
	if timeout <= 0 {
		timeout = defaultChunkTimeout
	}
	r := &TimeoutStreamReader{
		inner:   inner,
		timeout: timeout,
		ch:      make(chan nextResult, 1),
		done:    make(chan struct{}),
	}
	go r.readLoop()
	return r
}

func (r *TimeoutStreamReader) readLoop() {
	defer close(r.ch)
	for {
		delta, err := r.inner.Next()
		select {
		case r.ch <- nextResult{delta, err}:
		case <-r.done:
			return
		}
		if err != nil {
			return
		}
	}
}

// Next returns the next delta or an error if the per-chunk timeout expires.
func (r *TimeoutStreamReader) Next() (*StreamDelta, error) {
	select {
	case result, ok := <-r.ch:
		if !ok {
			return nil, fmt.Errorf("stream closed")
		}
		return result.delta, result.err
	case <-time.After(r.timeout):
		_ = r.Close()
		return nil, fmt.Errorf("stream timeout: no data received for %s", r.timeout)
	}
}

// Close releases resources associated with the stream.
func (r *TimeoutStreamReader) Close() error {
	select {
	case <-r.done:
		// already closed
	default:
		close(r.done)
	}
	return r.inner.Close()
}
