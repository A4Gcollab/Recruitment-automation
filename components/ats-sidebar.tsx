"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sparkles,
  Layers,
  Users,
  MessageCircle,
  FileText,
  BarChart2,
  Settings,
  LayoutDashboard,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  {
    href: "/dashboard",
    label: "Campaigns",
    icon: Layers,
    prefixes: ["/dashboard", "/campaigns"],
  },
  {
    href: "#",
    label: "Dashboard",
    icon: LayoutDashboard,
    prefixes: ["/overview"],
  },
  {
    href: "#",
    label: "Candidates",
    icon: Users,
    prefixes: ["/candidates"],
  },
  {
    href: "#",
    label: "Messages",
    icon: MessageCircle,
    prefixes: ["/messages"],
  },
  {
    href: "#",
    label: "Templates",
    icon: FileText,
    prefixes: ["/templates"],
  },
  {
    href: "#",
    label: "Evaluations",
    icon: ClipboardList,
    prefixes: ["/evaluations"],
  },
  {
    href: "#",
    label: "Reports",
    icon: BarChart2,
    prefixes: ["/reports"],
  },
  {
    href: "#",
    label: "Settings",
    icon: Settings,
    prefixes: ["/settings"],
  },
];

export function AtsSidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="relative z-20 flex h-screen w-[220px] shrink-0 flex-col overflow-hidden"
      style={{
        background:
          "linear-gradient(180deg, #0F3DCC 0%, #1248E0 50%, #0B57D0 100%)",
      }}
    >
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute -top-16 left-1/2 size-64 -translate-x-1/2 rounded-full opacity-25 blur-3xl"
        style={{
          background: "radial-gradient(circle, #93c5fd 0%, transparent 70%)",
        }}
      />
      <div
        className="pointer-events-none absolute bottom-20 -right-8 size-44 rounded-full opacity-15 blur-3xl"
        style={{
          background: "radial-gradient(circle, #60a5fa 0%, transparent 70%)",
        }}
      />

      {/* Brand */}
      <div className="relative border-b border-white/[0.07] px-4 py-4">
        <Link href="/dashboard" className="group flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.15] ring-1 ring-white/20 transition-all group-hover:bg-white/20">
            <Sparkles className="size-[15px] text-white" aria-hidden />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[11px] font-semibold tracking-tight text-white">
              Omysha Foundation
            </p>
            <p className="truncate text-[9.5px] text-white/50">Recruitment</p>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="relative flex-1 space-y-0.5 overflow-y-auto px-2.5 py-3">
        {navItems.map(({ href, label, icon: Icon, prefixes }) => {
          const isActive = prefixes.some((p) => pathname.startsWith(p));
          return (
            <Link
              key={label}
              href={href}
              className={cn(
                "group flex items-center gap-2.5 rounded-xl px-2.5 py-[7px] text-[12.5px] font-medium transition-all duration-150",
                isActive
                  ? "bg-white/[0.13] text-white shadow-sm ring-1 ring-white/10 backdrop-blur-sm"
                  : "text-white/60 hover:bg-white/[0.07] hover:text-white/90"
              )}
            >
              <Icon
                className={cn(
                  "size-[15px] shrink-0 transition-opacity",
                  isActive
                    ? "opacity-100"
                    : "opacity-60 group-hover:opacity-85"
                )}
              />
              <span className="flex-1 truncate">{label}</span>
              {isActive && (
                <span className="size-1.5 shrink-0 rounded-full bg-white/70" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="relative border-t border-white/[0.07] px-3.5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/[0.18] text-[10px] font-bold uppercase text-white">
            A
          </div>
          <div className="min-w-0">
            <p className="truncate text-[11.5px] font-medium text-white">
              Admin User
            </p>
            <p className="truncate text-[9.5px] text-white/45">HR Manager</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
