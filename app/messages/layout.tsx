import { AuthGuard } from "@/components/auth-guard";
import { AtsSidebar } from "@/components/ats-sidebar";

export default function MessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden bg-[#F8FAFC] dark:bg-slate-950">
        <AtsSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
      </div>
    </AuthGuard>
  );
}
