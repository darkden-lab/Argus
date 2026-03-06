package pvcbrowser

import (
	"bytes"
	"context"
	"fmt"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/darkden-lab/argus/backend/internal/cluster"
)

const (
	basePath       = "/mnt/pvc"
	maxFileSize    = 10 * 1024 * 1024 // 10 MB
)

// FileInfo describes a file or directory entry.
type FileInfo struct {
	Name        string `json:"name"`
	Size        int64  `json:"size"`
	IsDir       bool   `json:"is_dir"`
	ModTime     string `json:"mod_time"`
	Permissions string `json:"permissions"`
	IsSymlink   bool   `json:"is_symlink"`
}

// sanitizePath resolves userPath under base, preventing path traversal.
func sanitizePath(base, userPath string) (string, error) {
	if userPath == "" {
		userPath = "/"
	}
	clean := filepath.Clean(userPath)
	full := filepath.Join(base, clean)
	if !strings.HasPrefix(full, base) {
		return "", fmt.Errorf("path traversal rejected: %q", userPath)
	}
	return full, nil
}

// ListDir lists the contents of a directory inside the PVC.
func ListDir(ctx context.Context, mgr *cluster.Manager, session *Session, path string) ([]FileInfo, error) {
	fullPath, err := sanitizePath(basePath, path)
	if err != nil {
		return nil, err
	}

	cmd := []string{"ls", "-la", "--time-style=full-iso", fullPath}
	out, err := execInPod(ctx, mgr, session, cmd, nil)
	if err != nil {
		return nil, fmt.Errorf("ls: %w", err)
	}

	return parseLsOutput(string(out)), nil
}

func parseLsOutput(output string) []FileInfo {
	lines := strings.Split(strings.TrimSpace(output), "\n")
	var files []FileInfo

	for _, line := range lines {
		// Skip "total N" line and empty lines
		if strings.HasPrefix(line, "total ") || line == "" {
			continue
		}

		fields := strings.Fields(line)
		// ls -la --time-style=full-iso produces:
		// perms links owner group size date time timezone name...
		if len(fields) < 9 {
			continue
		}

		perms := fields[0]
		size, _ := strconv.ParseInt(fields[4], 10, 64)
		modTime := fields[5] + " " + fields[6]
		name := strings.Join(fields[8:], " ")

		// Skip . and .. entries
		if name == "." || name == ".." {
			continue
		}

		// Handle symlinks: name -> target
		isSymlink := perms[0] == 'l'
		if isSymlink {
			if idx := strings.Index(name, " -> "); idx != -1 {
				name = name[:idx]
			}
		}

		files = append(files, FileInfo{
			Name:        name,
			Size:        size,
			IsDir:       perms[0] == 'd',
			ModTime:     modTime,
			Permissions: perms,
			IsSymlink:   isSymlink,
		})
	}

	return files
}

// StatFile returns info about a single file.
func StatFile(ctx context.Context, mgr *cluster.Manager, session *Session, path string) (*FileInfo, error) {
	fullPath, err := sanitizePath(basePath, path)
	if err != nil {
		return nil, err
	}

	cmd := []string{"stat", "-c", "%F|%s|%Y|%A|%N", fullPath}
	out, err := execInPod(ctx, mgr, session, cmd, nil)
	if err != nil {
		return nil, fmt.Errorf("stat: %w", err)
	}

	return parseStatOutput(strings.TrimSpace(string(out)), filepath.Base(fullPath))
}

func parseStatOutput(output, name string) (*FileInfo, error) {
	parts := strings.SplitN(output, "|", 5)
	if len(parts) < 5 {
		return nil, fmt.Errorf("unexpected stat output: %q", output)
	}

	size, _ := strconv.ParseInt(parts[1], 10, 64)

	fi := &FileInfo{
		Name:        name,
		Size:        size,
		IsDir:       strings.Contains(parts[0], "directory"),
		ModTime:     parts[2],
		Permissions: parts[3],
		IsSymlink:   strings.Contains(parts[0], "symbolic link"),
	}

	return fi, nil
}

// ReadFile reads the content of a file. Returns content, isBinary flag, and error.
func ReadFile(ctx context.Context, mgr *cluster.Manager, session *Session, path string) ([]byte, bool, error) {
	fullPath, err := sanitizePath(basePath, path)
	if err != nil {
		return nil, false, err
	}

	// Check size first
	sizeCmd := []string{"stat", "-c", "%s", fullPath}
	sizeOut, err := execInPod(ctx, mgr, session, sizeCmd, nil)
	if err != nil {
		return nil, false, fmt.Errorf("stat size: %w", err)
	}

	size, err := strconv.ParseInt(strings.TrimSpace(string(sizeOut)), 10, 64)
	if err != nil {
		return nil, false, fmt.Errorf("parse size: %w", err)
	}
	if size > maxFileSize {
		return nil, false, fmt.Errorf("file too large: %d bytes (max %d)", size, maxFileSize)
	}

	// Read file
	cmd := []string{"cat", fullPath}
	content, err := execInPod(ctx, mgr, session, cmd, nil)
	if err != nil {
		return nil, false, fmt.Errorf("read file: %w", err)
	}

	// Check for binary content (null bytes)
	isBinary := bytes.Contains(content, []byte{0})

	return content, isBinary, nil
}

// WriteFile writes content to a file via stdin pipe to tee.
func WriteFile(ctx context.Context, mgr *cluster.Manager, session *Session, path string, content []byte) error {
	fullPath, err := sanitizePath(basePath, path)
	if err != nil {
		return err
	}

	cmd := []string{"tee", fullPath}
	_, err = execInPod(ctx, mgr, session, cmd, bytes.NewReader(content))
	if err != nil {
		return fmt.Errorf("write file: %w", err)
	}

	return nil
}

// MkDir creates a directory (and parents) inside the PVC.
func MkDir(ctx context.Context, mgr *cluster.Manager, session *Session, path string) error {
	fullPath, err := sanitizePath(basePath, path)
	if err != nil {
		return err
	}

	cmd := []string{"mkdir", "-p", fullPath}
	_, err = execInPod(ctx, mgr, session, cmd, nil)
	if err != nil {
		return fmt.Errorf("mkdir: %w", err)
	}

	return nil
}

// Remove deletes a file or directory inside the PVC.
func Remove(ctx context.Context, mgr *cluster.Manager, session *Session, path string, recursive bool) error {
	if path == "" || path == "/" {
		return fmt.Errorf("refusing to remove root path")
	}

	fullPath, err := sanitizePath(basePath, path)
	if err != nil {
		return err
	}

	// Extra safety: don't allow removing the mount root itself
	if fullPath == basePath || fullPath == basePath+"/" {
		return fmt.Errorf("refusing to remove PVC mount root")
	}

	var cmd []string
	if recursive {
		cmd = []string{"rm", "-rf", fullPath}
	} else {
		cmd = []string{"rm", "-f", fullPath}
	}

	_, err = execInPod(ctx, mgr, session, cmd, nil)
	if err != nil {
		return fmt.Errorf("remove: %w", err)
	}

	return nil
}

// Rename moves/renames a file or directory inside the PVC.
func Rename(ctx context.Context, mgr *cluster.Manager, session *Session, oldPath, newPath string) error {
	fullOld, err := sanitizePath(basePath, oldPath)
	if err != nil {
		return err
	}
	fullNew, err := sanitizePath(basePath, newPath)
	if err != nil {
		return err
	}

	cmd := []string{"mv", fullOld, fullNew}
	_, err = execInPod(ctx, mgr, session, cmd, nil)
	if err != nil {
		return fmt.Errorf("rename: %w", err)
	}

	return nil
}
