package main

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var (
	version = "dev"
	server  string
)

func main() {
	rootCmd := &cobra.Command{
		Use:   "argus",
		Short: "CLI for Argus Dashboard - authenticate and manage clusters via the dashboard proxy",
		Long: `argus connects your local kubectl to the Argus Dashboard's authenticated proxy.
After logging in, kubectl commands are routed through the dashboard with full RBAC enforcement.`,
		Version: version,
	}

	rootCmd.PersistentFlags().StringVar(&server, "server", "", "Dashboard server URL (e.g. https://dashboard.example.com)")

	rootCmd.AddCommand(
		newLoginCmd(),
		newLogoutCmd(),
		newContextsCmd(),
		newVersionCmd(),
	)

	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
