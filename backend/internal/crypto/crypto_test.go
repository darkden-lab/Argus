package crypto

import (
	"bytes"
	"encoding/hex"
	"strings"
	"testing"
)

func testKey() string {
	// 32 bytes = 64 hex chars for AES-256
	return "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
}

func TestEncryptDecrypt(t *testing.T) {
	plaintext := []byte("kubeconfig-data-here")
	key := testKey()

	ciphertext, err := Encrypt(plaintext, key)
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}

	decrypted, err := Decrypt(ciphertext, key)
	if err != nil {
		t.Fatalf("Decrypt failed: %v", err)
	}

	if string(decrypted) != string(plaintext) {
		t.Fatalf("expected %q, got %q", plaintext, decrypted)
	}
}

func TestDecryptInvalidKey(t *testing.T) {
	plaintext := []byte("secret-data")
	key := testKey()

	ciphertext, err := Encrypt(plaintext, key)
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}

	// Different valid 256-bit key
	wrongKey := hex.EncodeToString(make([]byte, 32))
	_, err = Decrypt(ciphertext, wrongKey)
	if err == nil {
		t.Fatal("expected error when decrypting with wrong key, got nil")
	}
}

func TestDecryptCorrupted(t *testing.T) {
	plaintext := []byte("important-data")
	key := testKey()

	ciphertext, err := Encrypt(plaintext, key)
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}

	// Tamper with ciphertext
	if len(ciphertext) > 0 {
		ciphertext[len(ciphertext)-1] ^= 0xff
	}

	_, err = Decrypt(ciphertext, key)
	if err == nil {
		t.Fatal("expected error when decrypting corrupted ciphertext, got nil")
	}
}

// --- Security Tests ---

// TestEncryptDeterminism verifies that encryption is non-deterministic
// (same plaintext produces different ciphertext due to random nonce).
func TestEncryptNonDeterministic(t *testing.T) {
	key := testKey()
	plaintext := []byte("same-data")

	ct1, err := Encrypt(plaintext, key)
	if err != nil {
		t.Fatalf("Encrypt 1 failed: %v", err)
	}

	ct2, err := Encrypt(plaintext, key)
	if err != nil {
		t.Fatalf("Encrypt 2 failed: %v", err)
	}

	if bytes.Equal(ct1, ct2) {
		t.Fatal("SECURITY: encryption is deterministic - same plaintext produced identical ciphertext")
	}

	// Both should decrypt to the same value
	d1, _ := Decrypt(ct1, key)
	d2, _ := Decrypt(ct2, key)
	if !bytes.Equal(d1, d2) {
		t.Fatal("different ciphertexts did not decrypt to same plaintext")
	}
}

// TestEncryptInvalidKeyFormats tests various invalid key formats.
func TestEncryptInvalidKeyFormats(t *testing.T) {
	invalidKeys := []string{
		"",                             // empty
		"short",                        // too short
		"not-hex-string!!",             // not hex
		"0123456789abcdef",             // 16 hex = 8 bytes (too short for AES)
		"0123456789abcdef0123456789ab", // 28 hex = 14 bytes (invalid AES size)
		strings.Repeat("g", 64),        // 64 non-hex chars
	}

	for _, key := range invalidKeys {
		_, err := Encrypt([]byte("test"), key)
		if err == nil {
			t.Errorf("SECURITY: Encrypt accepted invalid key: %q", key)
		}

		_, err = Decrypt([]byte("test"), key)
		if err == nil {
			t.Errorf("SECURITY: Decrypt accepted invalid key: %q", key)
		}
	}
}

// TestDecryptTooShortCiphertext verifies that ciphertext shorter than nonce is rejected.
func TestDecryptTooShortCiphertext(t *testing.T) {
	key := testKey()

	shortInputs := [][]byte{
		nil,
		{},
		{0x01},
		{0x01, 0x02, 0x03},
		make([]byte, 11), // GCM nonce is 12 bytes, so 11 is too short
	}

	for _, input := range shortInputs {
		_, err := Decrypt(input, key)
		if err == nil {
			t.Errorf("SECURITY: Decrypt accepted ciphertext shorter than nonce (len=%d)", len(input))
		}
	}
}

// TestEncryptEmptyPlaintext verifies that empty plaintext can be encrypted/decrypted.
func TestEncryptEmptyPlaintext(t *testing.T) {
	key := testKey()

	ct, err := Encrypt([]byte{}, key)
	if err != nil {
		t.Fatalf("Encrypt empty failed: %v", err)
	}

	pt, err := Decrypt(ct, key)
	if err != nil {
		t.Fatalf("Decrypt empty failed: %v", err)
	}

	if len(pt) != 0 {
		t.Errorf("expected empty plaintext, got %d bytes", len(pt))
	}
}

// TestEncryptLargePlaintext tests encryption with large data.
func TestEncryptLargePlaintext(t *testing.T) {
	key := testKey()
	// 1MB of data
	large := bytes.Repeat([]byte("A"), 1024*1024)

	ct, err := Encrypt(large, key)
	if err != nil {
		t.Fatalf("Encrypt large failed: %v", err)
	}

	pt, err := Decrypt(ct, key)
	if err != nil {
		t.Fatalf("Decrypt large failed: %v", err)
	}

	if !bytes.Equal(pt, large) {
		t.Fatal("large plaintext round-trip failed")
	}
}

// TestDecryptNonceTampering tests that modifying the nonce fails.
func TestDecryptNonceTampering(t *testing.T) {
	key := testKey()
	ct, err := Encrypt([]byte("secret"), key)
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}

	// Tamper with nonce (first 12 bytes for GCM)
	if len(ct) > 0 {
		ct[0] ^= 0xff
	}

	_, err = Decrypt(ct, key)
	if err == nil {
		t.Fatal("SECURITY: decryption succeeded with tampered nonce")
	}
}

// TestEncryptKeySize verifies only valid AES key sizes work (16, 24, 32 bytes).
func TestEncryptValidKeySizes(t *testing.T) {
	// 32 bytes hex = 16 byte key (AES-128)
	key128 := hex.EncodeToString(make([]byte, 16))
	_, err := Encrypt([]byte("test"), key128)
	if err != nil {
		t.Errorf("AES-128 key should work: %v", err)
	}

	// 48 bytes hex = 24 byte key (AES-192)
	key192 := hex.EncodeToString(make([]byte, 24))
	_, err = Encrypt([]byte("test"), key192)
	if err != nil {
		t.Errorf("AES-192 key should work: %v", err)
	}

	// 64 bytes hex = 32 byte key (AES-256) -- standard test key
	key256 := testKey()
	_, err = Encrypt([]byte("test"), key256)
	if err != nil {
		t.Errorf("AES-256 key should work: %v", err)
	}

	// 20-byte key (invalid AES size)
	key160 := hex.EncodeToString(make([]byte, 20))
	_, err = Encrypt([]byte("test"), key160)
	if err == nil {
		t.Error("SECURITY: accepted invalid 20-byte key size")
	}
}
