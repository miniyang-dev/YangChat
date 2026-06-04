export interface Conversation {
  id: string;
  title: string;
  model: string;
  system_prompt: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  images?: string[];
  created_at: string;
}

export interface ConversationDetail extends Conversation {
  messages: Message[];
  created_at: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  vision: boolean;
}
