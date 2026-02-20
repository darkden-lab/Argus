package rag

import "strings"

// ChunkText splits a text into chunks of approximately maxChunkSize characters,
// splitting at sentence boundaries where possible.
func ChunkText(text string, maxChunkSize int) []string {
	if maxChunkSize <= 0 {
		maxChunkSize = 500
	}

	if len(text) <= maxChunkSize {
		return []string{text}
	}

	var chunks []string
	sentences := splitSentences(text)

	var current strings.Builder
	for _, sentence := range sentences {
		if current.Len()+len(sentence) > maxChunkSize && current.Len() > 0 {
			chunks = append(chunks, strings.TrimSpace(current.String()))
			current.Reset()
		}
		current.WriteString(sentence)
		current.WriteString(" ")
	}

	if current.Len() > 0 {
		chunks = append(chunks, strings.TrimSpace(current.String()))
	}

	return chunks
}

// splitSentences is a simple sentence splitter.
func splitSentences(text string) []string {
	var sentences []string
	var current strings.Builder

	for _, r := range text {
		current.WriteRune(r)
		if r == '.' || r == '!' || r == '?' || r == '\n' {
			s := strings.TrimSpace(current.String())
			if s != "" {
				sentences = append(sentences, s)
			}
			current.Reset()
		}
	}

	if current.Len() > 0 {
		s := strings.TrimSpace(current.String())
		if s != "" {
			sentences = append(sentences, s)
		}
	}

	return sentences
}
