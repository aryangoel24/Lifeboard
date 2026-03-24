"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { MessageBubble } from "@/components/chat/message-bubble";
import { Button } from "@/components/ui/button";
import { saveChatMessages, clearChatHistory } from "@/lib/actions/chat";
import type { ChatMessage } from "@/types/database";
import { Send, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";

const SUGGESTED_PROMPTS = [
  "What's one thing I should fix this week?",
  "Do I eat more on days I skip the gym?",
  "What pantry items should I use up soon?",
  "Which knowledge topics am I closest to mastering?",
];

type Props = {
  initialMessages: ChatMessage[];
};

function getMessageText(msg: UIMessage): string {
  return msg.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

export function ChatInterface({ initialMessages }: Props) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);

  const { messages, sendMessage, stop, status } = useChat({
    transport,
    messages: initialMessages.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      parts: [{ type: "text" as const, text: m.content }],
    })),
    onFinish: async ({ message, messages: allMessages }) => {
      const assistantText = getMessageText(message);
      // Find the last user message preceding this assistant message
      const msgIndex = allMessages.findIndex((m) => m.id === message.id);
      const lastUserMsg = allMessages
        .slice(0, msgIndex)
        .reverse()
        .find((m) => m.role === "user");
      const userText = lastUserMsg ? getMessageText(lastUserMsg) : "";

      const toolEvents = message.parts
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((p): p is any => (p as { type: string }).type === "tool-result")
        .map((p: { toolName?: string; input?: unknown; state?: string; output?: unknown }) => ({
          name: p.toolName ?? "",
          input: p.input,
          state: p.state ?? "",
          output: p.output,
        }));

      await saveChatMessages(userText, assistantText, {
        tool_events: toolEvents,
        model: "claude-sonnet-4-6",
        step_count: toolEvents.length,
      });
    },
    onError: (err) => {
      toast.error("Something went wrong. Please try again.");
      console.error(err);
    },
  });

  const isLoading = status === "streaming" || status === "submitted";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input.trim() });
    setInput("");
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = async () => {
    const result = await clearChatHistory();
    if ("error" in result) {
      toast.error(result.error);
    } else {
      window.location.reload();
    }
  };

  const visibleMessages = messages.filter((m) => (m.role as string) !== "system");
  const isEmpty = visibleMessages.length === 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b">
        <div>
          <h1 className="text-lg font-semibold">Lifeboard AI</h1>
          <p className="text-xs text-muted-foreground">Your personal reasoning system</p>
        </div>
        {!isEmpty && (
          <Button variant="ghost" size="icon" onClick={handleClear} title="Clear history">
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-3">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
            <div>
              <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
                Lifeboard AI
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Ask me anything about your health, habits, and goals.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => {
                    setInput(prompt);
                    inputRef.current?.focus();
                  }}
                  className="text-left text-sm px-4 py-3 rounded-xl border border-border hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {visibleMessages.map((m) => {
              const text = getMessageText(m);
              if (!text && m.role === "assistant") return null;
              return (
                <MessageBubble
                  key={m.id}
                  role={m.role as "user" | "assistant"}
                  content={text}
                />
              );
            })}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-2.5">
                  <span className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:300ms]" />
                  </span>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 pt-4 border-t">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything about your health, habits, and goals…"
          rows={1}
          className="flex-1 resize-none rounded-xl border border-input bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/50 min-h-[44px] max-h-32"
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = Math.min(el.scrollHeight, 128) + "px";
          }}
        />
        {isLoading ? (
          <Button type="button" size="icon" variant="outline" onClick={stop}>
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button type="button" size="icon" disabled={!input.trim()} onClick={handleSend}>
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
