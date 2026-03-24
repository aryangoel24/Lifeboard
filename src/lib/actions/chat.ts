"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ChatMessage } from "@/types/database";

export async function getChatHistory(limit = 50): Promise<ChatMessage[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(limit);

  return (data ?? []) as ChatMessage[];
}

export async function saveChatMessages(
  userContent: string,
  assistantContent: string,
  metadata?: {
    tool_events?: Array<{ name: string; input: unknown; state: string; output: unknown }>;
    model?: string;
    step_count?: number;
    tokens_used?: number;
  }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  const rows = [
    { user_id: user.id, role: "user", content: userContent, metadata: null },
    {
      user_id: user.id,
      role: "assistant",
      content: assistantContent,
      metadata: metadata ?? null,
    },
  ];

  const { error } = await supabase.from("chat_messages").insert(rows);
  if (error) return { error: error.message };

  revalidatePath("/chat");
  return { success: true };
}

export async function clearChatHistory() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("chat_messages")
    .delete()
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/chat");
  return { success: true };
}
