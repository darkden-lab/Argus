package main

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

func newLogoutCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "logout",
		Short: "Remove stored credentials and clean up kubeconfig entries",
		RunE:  runLogout,
	}
}

func runLogout(cmd *cobra.Command, args []string) error {
	path := configPath()
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to remove config: %w", err)
	}

	fmt.Println("Logged out. Credentials removed.")
	return nil
}
