package helm

import (
	"k8s.io/apimachinery/pkg/api/meta"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/discovery/cached/memory"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/restmapper"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

// simpleRESTClientGetter implements genericclioptions.RESTClientGetter
// using a pre-existing rest.Config from the cluster manager.
type simpleRESTClientGetter struct {
	restConfig *rest.Config
	namespace  string
}

func (g *simpleRESTClientGetter) ToRESTConfig() (*rest.Config, error) {
	return g.restConfig, nil
}

func (g *simpleRESTClientGetter) ToDiscoveryClient() (discovery.CachedDiscoveryInterface, error) {
	dc, err := discovery.NewDiscoveryClientForConfig(g.restConfig)
	if err != nil {
		return nil, err
	}
	return memory.NewMemCacheClient(dc), nil
}

func (g *simpleRESTClientGetter) ToRESTMapper() (meta.RESTMapper, error) {
	dc, err := g.ToDiscoveryClient()
	if err != nil {
		return nil, err
	}
	mapper := restmapper.NewDeferredDiscoveryRESTMapper(dc)
	return mapper, nil
}

func (g *simpleRESTClientGetter) ToRawKubeConfigLoader() clientcmd.ClientConfig {
	return &simpleClientConfig{
		restConfig: g.restConfig,
		namespace:  g.namespace,
	}
}

// simpleClientConfig implements clientcmd.ClientConfig backed by a rest.Config.
type simpleClientConfig struct {
	restConfig *rest.Config
	namespace  string
}

func (c *simpleClientConfig) RawConfig() (clientcmdapi.Config, error) {
	return clientcmdapi.Config{}, nil
}

func (c *simpleClientConfig) ClientConfig() (*rest.Config, error) {
	return c.restConfig, nil
}

func (c *simpleClientConfig) Namespace() (string, bool, error) {
	ns := c.namespace
	if ns == "" {
		ns = "default"
	}
	return ns, false, nil
}

func (c *simpleClientConfig) ConfigAccess() clientcmd.ConfigAccess {
	return nil
}
