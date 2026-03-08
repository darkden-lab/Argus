package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

const argusContextPrefix = "argus-"

func newKubeconfigCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "kubeconfig",
		Short: "Manage kubeconfig entries for Argus-proxied clusters",
		Long: `Generate, list, and remove kubeconfig entries that route kubectl
commands through the Argus Dashboard proxy with full RBAC enforcement.`,
	}

	cmd.AddCommand(
		newKubeconfigGenerateCmd(),
		newKubeconfigListCmd(),
		newKubeconfigRemoveCmd(),
	)

	return cmd
}

func newKubeconfigGenerateCmd() *cobra.Command {
	var (
		clusterName        string
		output             string
		caCert             string
		insecureSkipVerify bool
	)

	cmd := &cobra.Command{
		Use:   "generate",
		Short: "Generate kubeconfig entries for Argus-proxied clusters",
		Long: `Fetches available clusters from the dashboard and generates kubeconfig
entries that use the Argus proxy as the API server. Merges with existing kubeconfig.`,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runKubeconfigGenerate(clusterName, output, caCert, insecureSkipVerify)
		},
	}

	cmd.Flags().StringVar(&clusterName, "cluster", "", "Generate for a specific cluster name only")
	cmd.Flags().StringVarP(&output, "output", "o", "", "Output path (default: ~/.kube/config)")
	cmd.Flags().StringVar(&caCert, "ca-cert", "", "Path to CA certificate for the Argus proxy")
	cmd.Flags().BoolVar(&insecureSkipVerify, "insecure-skip-tls-verify", false, "Skip TLS verification for proxy connection (not recommended)")

	return cmd
}

func newKubeconfigListCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "list",
		Short: "List Argus-managed contexts in kubeconfig",
		RunE:  runKubeconfigList,
	}
}

func newKubeconfigRemoveCmd() *cobra.Command {
	var all bool

	cmd := &cobra.Command{
		Use:   "remove [context-name]",
		Short: "Remove Argus-managed contexts from kubeconfig",
		Long:  `Removes an Argus-managed context (and its associated cluster/user) from kubeconfig.`,
		Args:  cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			var name string
			if len(args) > 0 {
				name = args[0]
			}
			return runKubeconfigRemove(name, all)
		},
	}

	cmd.Flags().BoolVar(&all, "all", false, "Remove all Argus-managed contexts")

	return cmd
}

func runKubeconfigGenerate(clusterFilter, output, caCert string, insecureSkipVerify bool) error {
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

	// Filter to specific cluster if requested
	if clusterFilter != "" {
		var filtered []clusterInfo
		for _, c := range clusters {
			if c.Name == clusterFilter || c.ID == clusterFilter {
				filtered = append(filtered, c)
			}
		}
		if len(filtered) == 0 {
			return fmt.Errorf("cluster %q not found", clusterFilter)
		}
		clusters = filtered
	}

	kubeconfigPath := resolveKubeconfigPath(output)

	// Load existing kubeconfig or create empty one
	kubeconfig, err := loadOrCreateKubeconfig(kubeconfigPath)
	if err != nil {
		return fmt.Errorf("failed to load kubeconfig: %w", err)
	}

	userName := argusContextPrefix + sanitizeName(cfg.Email)

	// Ensure the argus user entry exists
	kubeconfig.AuthInfos[userName] = &clientcmdapi.AuthInfo{
		Token: cfg.Token,
	}

	for _, c := range clusters {
		contextName := argusContextPrefix + sanitizeName(c.Name)
		clusterEntry := contextName
		serverURL := fmt.Sprintf("%s/api/proxy/k8s/%s", cfg.Server, c.ID)

		clusterConfig := &clientcmdapi.Cluster{
			Server:                serverURL,
			InsecureSkipTLSVerify: insecureSkipVerify,
		}
		if caCert != "" {
			clusterConfig.CertificateAuthority = caCert
			clusterConfig.InsecureSkipTLSVerify = false
		}
		kubeconfig.Clusters[clusterEntry] = clusterConfig

		kubeconfig.Contexts[contextName] = &clientcmdapi.Context{
			Cluster:  clusterEntry,
			AuthInfo: userName,
		}

		fmt.Printf("  Added context %q → %s\n", contextName, serverURL)
	}

	// Ensure parent directory exists
	if dir := filepath.Dir(kubeconfigPath); dir != "" {
		if err := os.MkdirAll(dir, 0700); err != nil {
			return fmt.Errorf("failed to create directory %s: %w", dir, err)
		}
	}

	if err := clientcmd.WriteToFile(*kubeconfig, kubeconfigPath); err != nil {
		return fmt.Errorf("failed to write kubeconfig: %w", err)
	}
	if err := os.Chmod(kubeconfigPath, 0600); err != nil {
		return fmt.Errorf("failed to set kubeconfig permissions: %w", err)
	}

	fmt.Printf("\nKubeconfig written to %s (permissions: 0600)\n", kubeconfigPath)
	fmt.Printf("Generated %d context(s) for user %q.\n", len(clusters), userName)
	fmt.Printf("\nUsage:\n")
	if len(clusters) == 1 {
		fmt.Printf("  kubectl --context %s get pods\n", argusContextPrefix+sanitizeName(clusters[0].Name))
	} else {
		fmt.Printf("  kubectl --context argus-<cluster-name> get pods\n")
	}

	return nil
}

func runKubeconfigList(cmd *cobra.Command, args []string) error {
	kubeconfigPath := resolveKubeconfigPath("")

	kubeconfig, err := loadOrCreateKubeconfig(kubeconfigPath)
	if err != nil {
		return fmt.Errorf("failed to load kubeconfig: %w", err)
	}

	// Find current context
	currentCtx := kubeconfig.CurrentContext

	// Collect argus-managed contexts
	var found []string
	for name := range kubeconfig.Contexts {
		if strings.HasPrefix(name, argusContextPrefix) {
			found = append(found, name)
		}
	}

	if len(found) == 0 {
		fmt.Println("No Argus-managed contexts found in kubeconfig.")
		fmt.Println("Run 'argus kubeconfig generate' to create them.")
		return nil
	}

	fmt.Printf("Argus-managed contexts in %s:\n\n", kubeconfigPath)
	fmt.Printf("  %-4s %-30s %s\n", "", "CONTEXT", "SERVER")
	fmt.Printf("  %-4s %-30s %s\n", "", "------------------------------", "------")

	for _, name := range found {
		ctx := kubeconfig.Contexts[name]
		serverURL := ""
		if cluster, ok := kubeconfig.Clusters[ctx.Cluster]; ok {
			serverURL = cluster.Server
		}

		marker := "  "
		if name == currentCtx {
			marker = "* "
		}

		fmt.Printf("  %s%-30s %s\n", marker, name, serverURL)
	}

	fmt.Printf("\n%d Argus context(s) found.\n", len(found))
	return nil
}

func runKubeconfigRemove(contextName string, all bool) error {
	if !all && contextName == "" {
		return fmt.Errorf("specify a context name or use --all to remove all Argus contexts")
	}

	kubeconfigPath := resolveKubeconfigPath("")

	kubeconfig, err := loadOrCreateKubeconfig(kubeconfigPath)
	if err != nil {
		return fmt.Errorf("failed to load kubeconfig: %w", err)
	}

	var toRemove []string

	if all {
		for name := range kubeconfig.Contexts {
			if strings.HasPrefix(name, argusContextPrefix) {
				toRemove = append(toRemove, name)
			}
		}
	} else {
		// Allow both with and without prefix
		name := contextName
		if !strings.HasPrefix(name, argusContextPrefix) {
			name = argusContextPrefix + name
		}
		if _, ok := kubeconfig.Contexts[name]; ok {
			toRemove = append(toRemove, name)
		} else {
			return fmt.Errorf("context %q not found in kubeconfig", name)
		}
	}

	if len(toRemove) == 0 {
		fmt.Println("No Argus-managed contexts found to remove.")
		return nil
	}

	// Track which users to potentially clean up
	usersInUse := make(map[string]bool)
	for name, ctx := range kubeconfig.Contexts {
		if !strings.HasPrefix(name, argusContextPrefix) {
			usersInUse[ctx.AuthInfo] = true
		}
	}

	for _, name := range toRemove {
		ctx := kubeconfig.Contexts[name]

		// Remove the cluster entry
		delete(kubeconfig.Clusters, ctx.Cluster)

		// Remove the context
		delete(kubeconfig.Contexts, name)

		// If current context is being removed, clear it
		if kubeconfig.CurrentContext == name {
			kubeconfig.CurrentContext = ""
		}

		fmt.Printf("  Removed context %q\n", name)
	}

	// Clean up argus user entries that are no longer referenced
	argusUsers := make(map[string]bool)
	for name := range kubeconfig.AuthInfos {
		if strings.HasPrefix(name, argusContextPrefix) {
			argusUsers[name] = true
		}
	}
	// Check if any remaining context still references an argus user
	for _, ctx := range kubeconfig.Contexts {
		delete(argusUsers, ctx.AuthInfo)
	}
	// Remove unreferenced argus users
	for user := range argusUsers {
		delete(kubeconfig.AuthInfos, user)
		fmt.Printf("  Removed user %q\n", user)
	}

	if err := clientcmd.WriteToFile(*kubeconfig, kubeconfigPath); err != nil {
		return fmt.Errorf("failed to write kubeconfig: %w", err)
	}
	if err := os.Chmod(kubeconfigPath, 0600); err != nil {
		return fmt.Errorf("failed to set kubeconfig permissions: %w", err)
	}

	fmt.Printf("\nRemoved %d context(s) from %s\n", len(toRemove), kubeconfigPath)
	return nil
}

// resolveKubeconfigPath returns the kubeconfig path to use.
func resolveKubeconfigPath(override string) string {
	if override != "" {
		return override
	}
	if env := os.Getenv("KUBECONFIG"); env != "" {
		// Use the first path if KUBECONFIG contains multiple
		parts := filepath.SplitList(env)
		if len(parts) > 0 {
			return parts[0]
		}
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".kube", "config")
}

// loadOrCreateKubeconfig loads an existing kubeconfig or creates an empty one.
func loadOrCreateKubeconfig(path string) (*clientcmdapi.Config, error) {
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return clientcmdapi.NewConfig(), nil
	}
	return clientcmd.LoadFromFile(path)
}

// sanitizeName converts a string to a safe kubeconfig name component.
func sanitizeName(name string) string {
	replacer := strings.NewReplacer(
		" ", "-",
		"@", "-at-",
		"/", "-",
		"\\", "-",
		":", "-",
	)
	return strings.ToLower(replacer.Replace(name))
}
