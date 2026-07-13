import type { AssistantStep, ProcessStep } from "@/components/assistant-steps-renderer";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  steps?: ProcessStep[];
}

export interface ConversationSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}
