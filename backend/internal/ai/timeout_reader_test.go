package ai

import (
	"io"
	"strings"
	"testing"
	"time"
)

// mockStreamReader implements StreamReader for testing purposes.
type mockStreamReader struct {
	deltas []*StreamDelta
	index  int
	// blockCh, if non-nil, causes Next() to block until the channel is closed.
	blockCh chan struct{}
}

func (m *mockStreamReader) Next() (*StreamDelta, error) {
	if m.blockCh != nil {
		<-m.blockCh
	}
	if m.index >= len(m.deltas) {
		return nil, io.EOF
	}
	d := m.deltas[m.index]
	m.index++
	return d, nil
}

func (m *mockStreamReader) Close() error {
	if m.blockCh != nil {
		select {
		case <-m.blockCh:
			// already closed
		default:
			close(m.blockCh)
		}
	}
	return nil
}

func TestTimeoutStreamReader_Normal(t *testing.T) {
	deltas := []*StreamDelta{
		{Content: "Hello"},
		{Content: " world"},
		{Content: "!", FinishReason: "stop"},
	}
	inner := &mockStreamReader{deltas: deltas}
	reader := NewTimeoutStreamReader(inner, 5*time.Second)
	defer reader.Close()

	var collected []string
	for {
		delta, err := reader.Next()
		if err != nil {
			if err == io.EOF {
				break
			}
			// The reader wraps EOF in a channel close, so check for "stream closed"
			if strings.Contains(err.Error(), "stream closed") {
				break
			}
			t.Fatalf("unexpected error: %v", err)
		}
		collected = append(collected, delta.Content)
	}

	if len(collected) != 3 {
		t.Errorf("got %d deltas, want 3", len(collected))
	}

	expected := "Hello world!"
	got := strings.Join(collected, "")
	if got != expected {
		t.Errorf("collected content = %q, want %q", got, expected)
	}
}

func TestTimeoutStreamReader_Timeout(t *testing.T) {
	// Create a reader that blocks forever on Next()
	inner := &mockStreamReader{
		deltas:  []*StreamDelta{{Content: "never"}},
		blockCh: make(chan struct{}),
	}
	reader := NewTimeoutStreamReader(inner, 100*time.Millisecond)
	defer reader.Close()

	start := time.Now()
	_, err := reader.Next()
	elapsed := time.Since(start)

	if err == nil {
		t.Fatal("Next() returned nil error, want timeout error")
	}
	if !strings.Contains(err.Error(), "stream timeout") {
		t.Errorf("Next() error = %q, want it to contain 'stream timeout'", err.Error())
	}

	// Verify the timeout was approximately correct (within generous bounds)
	if elapsed < 80*time.Millisecond || elapsed > 500*time.Millisecond {
		t.Errorf("timeout took %v, expected roughly 100ms", elapsed)
	}
}

func TestTimeoutStreamReader_CloseIdempotent(t *testing.T) {
	inner := &mockStreamReader{deltas: []*StreamDelta{}}
	reader := NewTimeoutStreamReader(inner, time.Second)

	// Closing multiple times should not panic
	if err := reader.Close(); err != nil {
		t.Errorf("first Close() returned error: %v", err)
	}
	if err := reader.Close(); err != nil {
		t.Errorf("second Close() returned error: %v", err)
	}
}

func TestTimeoutStreamReader_DefaultTimeout(t *testing.T) {
	inner := &mockStreamReader{deltas: []*StreamDelta{{Content: "ok"}}}
	// Passing zero timeout should use the default (30s)
	reader := NewTimeoutStreamReader(inner, 0)
	defer reader.Close()

	delta, err := reader.Next()
	if err != nil {
		t.Fatalf("Next() returned error: %v", err)
	}
	if delta.Content != "ok" {
		t.Errorf("delta.Content = %q, want %q", delta.Content, "ok")
	}
}
