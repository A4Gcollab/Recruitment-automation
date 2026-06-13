"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MoreVertical, Phone, Send, X } from "lucide-react";
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
      sendWhatsAppReply({ candidate_id: candidate.id, message: replyText }),
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

  const initials = candidate.full_name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex h-full flex-col bg-white dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-[11px] font-bold text-white shadow-sm">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {candidate.full_name}
          </p>
          <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">
            {candidate.phone ?? "No phone"} · {candidate.stage}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <Phone className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <MoreVertical className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            onClick={onClose}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4"
        style={{
          background:
            "linear-gradient(180deg, #f0fdf4 0%, #f8fafc 100%)",
        }}
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-5 animate-spin text-slate-300" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <p className="text-xs text-slate-400">No messages yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((msg) => (
              <ChatBubble key={msg.id} message={msg} />
            ))}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-slate-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        {windowOpen ? (
          <>
            <div className="flex items-end gap-2">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a reply..."
                rows={2}
                className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <button
                onClick={handleSend}
                disabled={!replyText.trim() || replyMutation.isPending}
                className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-sm transition-all hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {replyMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Send className="size-3.5" />
                )}
              </button>
            </div>
            <WindowTimer expiresAt={windowExpiresAt} />
          </>
        ) : (
          <p className="py-1 text-center text-[11px] text-slate-400">
            {windowExpiresAt
              ? "24h reply window closed. Send a template to re-engage."
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
    <div className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
          isOutbound
            ? "rounded-br-sm bg-emerald-500 text-white"
            : "rounded-bl-sm bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100"
        }`}
      >
        <p className="whitespace-pre-wrap break-words leading-relaxed">
          {message.body ?? `[${message.template_name ?? "message"}]`}
        </p>
        <div
          className={`mt-1 flex items-center gap-1 text-[10px] ${
            isOutbound ? "justify-end text-emerald-100" : "text-slate-400"
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
      return <span title="Sent" className="opacity-70">✓</span>;
    case "delivered":
      return <span title="Delivered">✓✓</span>;
    case "read":
      return (
        <span title="Read" className="text-blue-300">
          ✓✓
        </span>
      );
    case "failed":
      return (
        <span title="Failed" className="text-rose-300">
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
    <p className="mt-1.5 text-center text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
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
