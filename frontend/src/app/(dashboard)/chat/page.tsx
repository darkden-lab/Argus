"use client";

import { useEffect } from "react";
import { useAiChatStore } from "@/stores/ai-chat";
import { ChatInterface } from "@/components/ai/chat-interface";

export default function ChatPage() {
  const setIsFullPage = useAiChatStore((s) => s.setIsFullPage);

  useEffect(() => {
    setIsFullPage(true);
    return () => setIsFullPage(false);
  }, [setIsFullPage]);

  return (
    <div className="flex h-full flex-col">
      <ChatInterface mode="fullpage" />
    </div>
  );
}
