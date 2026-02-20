package crypto

import (
	"encoding/hex"
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
