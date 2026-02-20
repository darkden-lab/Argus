package main

import (
	"fmt"

	"github.com/spf13/cobra"
)

func newContextsCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "contexts",
		Short: "List available clusters from the dashboard",
		RunE:  runContexts,
	}
}

func runContexts(cmd *cobra.Command, args []string) error {
	cfg, err := loadConfig()
	if err != nil {
		return err
	}

	clusters, err := fetchClusters(cfg.Server, cfg.Token)
	if err != nil {
		return fmt.Errorf("failed to fetch clusters: %w", err)
	}

	if len(clusters) == 0 {
		fmt.Println("No clusters available.")
		return nil
	}

	fmt.Printf("Available clusters from %s:\n\n", cfg.Server)
	fmt.Printf("  %-36s  %s\n", "ID", "NAME")
	fmt.Printf("  %-36s  %s\n", "------------------------------------", "----")
	for _, c := range clusters {
		fmt.Printf("  %-36s  %s\n", c.ID, c.Name)
	}

	fmt.Printf("\nUse 'kubectl --context argus/<cluster-name>' to interact with a cluster.\n")
	return nil
}
