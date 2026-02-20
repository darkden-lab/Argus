package main

import (
	"fmt"
	"runtime"

	"github.com/spf13/cobra"
)

func newVersionCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "Print version information",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Printf("argus version %s\n", version)
			fmt.Printf("  Go:       %s\n", runtime.Version())
			fmt.Printf("  OS/Arch:  %s/%s\n", runtime.GOOS, runtime.GOARCH)
		},
	}
}
