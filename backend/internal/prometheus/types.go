package prometheus

import "encoding/json"

// PrometheusInstance represents a discovered Prometheus service in a cluster.
type PrometheusInstance struct {
	Namespace   string            `json:"namespace"`
	ServiceName string            `json:"serviceName"`
	Port        int               `json:"port"`
	PortName    string            `json:"portName"`
	Labels      map[string]string `json:"labels,omitempty"`
}

// PrometheusConfig holds the user-selected Prometheus instance for a cluster.
type PrometheusConfig struct {
	Namespace   string `json:"namespace"`
	ServiceName string `json:"serviceName"`
	Port        int    `json:"port"`
}

// QueryResult models the Prometheus /api/v1/query response.
type QueryResult struct {
	Status string    `json:"status"`
	Data   QueryData `json:"data"`
}

// QueryData holds the data field of a Prometheus query response.
type QueryData struct {
	ResultType string              `json:"resultType"`
	Result     []QueryResultItem   `json:"result"`
}

// QueryResultItem represents a single result from a Prometheus query.
type QueryResultItem struct {
	Metric map[string]string `json:"metric"`
	Value  [2]json.RawMessage `json:"value"`
}

// ValueAsFloat extracts the numeric value from a Prometheus query result item.
func (q *QueryResultItem) ValueAsFloat() (float64, error) {
	var s string
	if err := json.Unmarshal(q.Value[1], &s); err != nil {
		return 0, err
	}
	var f float64
	if err := json.Unmarshal([]byte(s), &f); err != nil {
		// Try parsing as string
		return 0, err
	}
	return f, nil
}

// AlertsResult models the Prometheus /api/v1/alerts response.
type AlertsResult struct {
	Status string     `json:"status"`
	Data   AlertsData `json:"data"`
}

// AlertsData holds the data field of a Prometheus alerts response.
type AlertsData struct {
	Alerts []Alert `json:"alerts"`
}

// Alert represents a single Prometheus alert.
type Alert struct {
	Labels      map[string]string `json:"labels"`
	Annotations map[string]string `json:"annotations"`
	State       string            `json:"state"`
	ActiveAt    string            `json:"activeAt"`
	Value       string            `json:"value"`
}

// TargetsResult models the Prometheus /api/v1/targets response.
type TargetsResult struct {
	Status string      `json:"status"`
	Data   TargetsData `json:"data"`
}

// TargetsData holds the data field of a Prometheus targets response.
type TargetsData struct {
	ActiveTargets  []Target `json:"activeTargets"`
	DroppedTargets []Target `json:"droppedTargets,omitempty"`
}

// Target represents a single Prometheus scrape target.
type Target struct {
	DiscoveredLabels map[string]string `json:"discoveredLabels,omitempty"`
	Labels           map[string]string `json:"labels,omitempty"`
	ScrapePool       string            `json:"scrapePool"`
	ScrapeURL        string            `json:"scrapeUrl"`
	GlobalURL        string            `json:"globalUrl,omitempty"`
	LastError        string            `json:"lastError"`
	LastScrape       string            `json:"lastScrape"`
	LastScrapeDuration float64         `json:"lastScrapeDuration"`
	Health           string            `json:"health"`
}
