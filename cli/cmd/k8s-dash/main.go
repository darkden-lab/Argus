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
		Use:   "k8s-dash",
		Short: "CLI for K8s Dashboard - authenticate and manage clusters via the dashboard proxy",
		Long: `k8s-dash connects your local kubectl to the K8s Dashboard's authenticated proxy.
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
