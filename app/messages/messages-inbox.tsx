"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Loader2, Inbox } from "lucide-react";
import type { MessageInboxItem } from "@/app/api/messages/route";

async function fetchMessages(): Promise<{ items: MessageInboxItem[]; total: number }> {
  const res = await fetch("/api/messages");
  if (!res.ok) throw new Error("Failed to load messages");
  return res.json();
}

export function MessagesInbox() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["messages-inbox"],
    queryFn: fetchMessages,
    refetchInterval: 30_000,
  });

  const items = data?.items ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Inbox
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Candidates who replied via WhatsApp
          {data ? ` · ${data.total} total` : ""}
        </p>
      </div>

      {/* Content */}
      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-5 animate-spin text-slate-300" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-sm text-destructive">Failed to load messages.</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
              <Inbox className="size-6 text-slate-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                No replies yet
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                Candidates who reply to WhatsApp messages will appear here.
              </p>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.map((item) => (
              <MessageRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function MessageRow({ item }: { item: MessageInboxItem }) {
  const initials = item.full_name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <li className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
      {/* Avatar */}
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-[11px] font-bold text-white shadow-sm">
        {initials}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {item.full_name}
          </span>
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            {item.campaign_name}
          </span>
        </div>
        {item.wa_last_reply ? (
          <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
            {item.wa_last_reply}
          </p>
        ) : (
          <p className="mt-0.5 text-xs italic text-slate-300 dark:text-slate-600">
            No text content
          </p>
        )}
        {item.phone && (
          <p className="mt-0.5 text-[11px] text-slate-400">{item.phone}</p>
        )}
      </div>

      {/* Time */}
      <div className="shrink-0 text-right">
        {item.wa_last_reply_at && (
          <p className="text-[11px] text-slate-400">
            {formatRelative(item.wa_last_reply_at)}
          </p>
        )}
      </div>

      {/* Open chat link */}
      <Link
        href={`/campaigns/${item.campaign_id}`}
        title="Open campaign to view full chat"
        className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600 transition-colors hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-400 dark:hover:bg-emerald-900"
      >
        <MessageCircle className="size-3.5" />
      </Link>
    </li>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const d = new Date(iso);
  return `${d.toLocaleString("en-US", { month: "short" })} ${d.getDate()}`;
}
