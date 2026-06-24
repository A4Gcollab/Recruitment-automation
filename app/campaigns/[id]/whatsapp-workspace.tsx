"use client";

import { MessageCircle } from "lucide-react";
import type { Candidate } from "@/lib/api/candidates";
import { WhatsAppChatPanel } from "./whatsapp-chat-panel";

export function WhatsAppWorkspace({
  candidate,
  onClose,
}: {
  candidate: Candidate | null;
  onClose: () => void;
}) {
  if (candidate) {
    return <WhatsAppChatPanel candidate={candidate} onClose={onClose} />;
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-8 py-12">
      {/* Illustration */}
      <div className="relative mb-2">
        {/* Outer ring */}
        <div className="flex size-28 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
          {/* Inner ring */}
          <div className="flex size-[72px] items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50">
            <MessageCircle
              className="size-9 text-emerald-500 dark:text-emerald-400"
              strokeWidth={1.5}
            />
          </div>
        </div>
        {/* Floating decoration bubbles */}
        <div className="absolute -right-1 -top-1 flex size-7 items-center justify-center rounded-full border-2 border-white bg-slate-100 dark:border-slate-900 dark:bg-slate-800">
          <div className="size-3 rounded-full bg-slate-300 dark:bg-slate-600" />
        </div>
        <div className="absolute -bottom-1.5 -left-2 size-5 rounded-full border-2 border-white bg-emerald-100 dark:border-slate-900 dark:bg-emerald-900/60" />
        <div className="absolute -left-4 top-3 size-3.5 rounded-full border-2 border-white bg-blue-100 dark:border-slate-900 dark:bg-blue-900/50" />
        <div className="absolute -right-5 bottom-4 size-4 rounded-full border-2 border-white bg-amber-100 dark:border-slate-900 dark:bg-amber-900/40" />
      </div>

      <div className="space-y-2 text-center">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          WhatsApp chat
        </h3>
        <p className="max-w-[190px] text-xs leading-relaxed text-slate-400 dark:text-slate-500">
          Click any WhatsApp icon from the table to open and manage
          conversations.
        </p>
      </div>
    </div>
  );
}
