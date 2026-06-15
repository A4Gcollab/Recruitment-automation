"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageCircle, Send, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  ApiClientError,
  fetchWhatsAppMessages,
  sendWhatsAppReply,
  type Candidate,
  type WhatsAppMessage,
} from "@/lib/api/candidates";

export function WhatsAppChatPanel({
  candidate,
  onClose,
}: {
  candidate: Candidate;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [replyText, setReplyText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const queryKey = ["whatsapp-messages", candidate.id] as const;

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchWhatsAppMessages(candidate.id),
    refetchInterval: 10_000,
  });

  const messages = data?.messages ?? [];
  const windowOpen = data?.window_open ?? false;
  const windowExpiresAt = data?.window_expires_at;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const replyMutation = useMutation({
    mutationFn: () =>
      sendWhatsAppReply({
        candidate_id: candidate.id,
        message: replyText,
      }),
    onSuccess: () => {
      setReplyText("");
      queryClient.invalidateQueries({ queryKey });
      toast.success("Reply sent");
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof ApiClientError ? err.message : "Failed to send reply";
      toast.error(msg);
    },
  });

  function handleSend() {
    if (!replyText.trim() || replyMutation.isPending) return;
    replyMutation.mutate();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l bg-background shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{candidate.full_name}</h3>
          <p className="text-xs text-muted-foreground">
            {candidate.phone ?? "No phone"} · {candidate.stage}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <MessageCircle className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No WhatsApp messages yet
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <ChatBubble key={msg.id} message={msg} />
            ))}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply input */}
      <div className="border-t px-4 py-3">
        {windowOpen ? (
          <>
            <div className="flex items-end gap-2">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a reply..."
                rows={2}
                className="flex-1 resize-none rounded-md border bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <Button
                size="icon"
                onClick={handleSend}
                disabled={!replyText.trim() || replyMutation.isPending}
              >
                {replyMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
              </Button>
            </div>
            <WindowTimer expiresAt={windowExpiresAt} />
          </>
        ) : (
          <p className="text-center text-xs text-muted-foreground">
            {windowExpiresAt
              ? "24h reply window closed. Send a template message to re-engage."
              : "No reply received yet. Send a WhatsApp template to start the conversation."}
          </p>
        )}
      </div>
    </div>
  );
}

function ChatBubble({ message }: { message: WhatsAppMessage }) {
  const isOutbound = message.direction === "outbound";
  const time = formatTime(message.created_at);

  return (
    <div className={`flex ${isOutbound ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
          isOutbound
            ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
            : "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
        }`}
      >
        <p className="whitespace-pre-wrap break-words">
          {message.body ?? `[${message.template_name ?? "message"}]`}
        </p>
        <div
          className={`mt-1 flex items-center gap-1 text-[10px] ${
            isOutbound
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-slate-500 dark:text-slate-400"
          }`}
        >
          <span>{time}</span>
          {isOutbound ? <StatusTicks status={message.status} /> : null}
        </div>
      </div>
    </div>
  );
}

function StatusTicks({ status }: { status: string }) {
  switch (status) {
    case "sent":
      return <span title="Sent">✓</span>;
    case "delivered":
      return <span title="Delivered">✓✓</span>;
    case "read":
      return (
        <span title="Read" className="text-blue-500">
          ✓✓
        </span>
      );
    case "failed":
      return (
        <span title="Failed" className="text-rose-500">
          ✕
        </span>
      );
    default:
      return null;
  }
}

function WindowTimer({ expiresAt }: { expiresAt: string | null | undefined }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  if (!expiresAt) return null;

  const remaining = new Date(expiresAt).getTime() - now;
  if (remaining <= 0) return null;

  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

  return (
    <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
      24h window: {hours}h {minutes}m remaining
    </p>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
