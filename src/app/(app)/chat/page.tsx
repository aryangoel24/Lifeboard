import { ChatInterface } from "@/components/chat/chat-interface";
import { getChatHistory } from "@/lib/actions/chat";

export const metadata = { title: "Chat — Lifeboard" };

export default async function ChatPage() {
  const history = await getChatHistory(50);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-3xl mx-auto px-4">
      <ChatInterface initialMessages={history} />
    </div>
  );
}
