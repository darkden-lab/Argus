"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ProgressSteps } from "@/components/ui/progress-steps";
import { useUIStore } from "@/stores/ui";
import { api } from "@/lib/api";
import { WelcomeStep } from "./steps/welcome";
import { ConnectStep } from "./steps/connect";
import { VerifyStep } from "./steps/verify";
import { CompleteStep } from "./steps/complete";

interface Cluster {
  id: string;
  name: string;
  api_server_url: string;
  status: string;
}

const wizardSteps = [
  { label: "Welcome" },
  { label: "Connect" },
  { label: "Verify" },
  { label: "Complete" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const setOnboardingCompleted = useUIStore((s) => s.setOnboardingCompleted);

  const [step, setStep] = useState(0);
  const [connectionType, setConnectionType] = useState<"kubeconfig" | "agent">("kubeconfig");
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    success: boolean;
    message: string;
    cluster?: Cluster;
  } | null>(null);
  const [retryClusterName, setRetryClusterName] = useState("");

  const handleConnectNext = useCallback(
    (result: { success: boolean; message: string; cluster?: Cluster }, type: "kubeconfig" | "agent") => {
      setConnectionType(type);
      setVerifying(true);
      setVerifyResult(null);
      setStep(2);
      // Simulate async transition (result already resolved in connect step)
      setTimeout(() => {
        setVerifying(false);
        setVerifyResult(result);
      }, 500);
    },
    []
  );

  const handleRetry = useCallback(async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      if (connectionType === "agent") {
        const clusters = await api.get<Cluster[]>("/api/clusters");
        const found = clusters.find((c) => c.name === retryClusterName);
        if (found) {
          setVerifyResult({ success: true, message: `Agent connected for cluster "${found.name}".`, cluster: found });
        } else {
          setVerifyResult({ success: false, message: "Agent not yet connected. Run the install command first." });
        }
      } else {
        setVerifyResult({ success: false, message: "Go back to re-enter kubeconfig details." });
      }
    } catch {
      setVerifyResult({ success: false, message: "Failed to verify connection." });
    } finally {
      setVerifying(false);
    }
  }, [connectionType, retryClusterName]);

  function handleComplete() {
    setOnboardingCompleted(true);
    router.push("/dashboard");
  }

  return (
    <div className="mx-auto max-w-2xl py-8">
      <ProgressSteps steps={wizardSteps} currentStep={step} className="mb-8" />

      {step === 0 && <WelcomeStep onNext={() => setStep(1)} />}

      {step === 1 && (
        <ConnectStep
          onNext={(result, type) => {
            if (type === "agent") {
              setRetryClusterName(result.cluster?.name ?? "");
            }
            handleConnectNext(result, type);
          }}
          onBack={() => setStep(0)}
        />
      )}

      {step === 2 && (
        <VerifyStep
          verifying={verifying}
          verifyResult={verifyResult}
          onNext={() => setStep(3)}
          onBack={() => {
            setVerifyResult(null);
            setStep(1);
          }}
          onRetry={handleRetry}
        />
      )}

      {step === 3 && (
        <CompleteStep
          onDashboard={handleComplete}
          onApps={() => {
            setOnboardingCompleted(true);
            router.push("/apps");
          }}
        />
      )}
    </div>
  );
}
