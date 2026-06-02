import { AuthGuard } from "@/components/auth-guard";
import { AppHeader } from "@/components/app-header";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="flex min-h-svh flex-col">
        <AppHeader />
        {children}
      </div>
    </AuthGuard>
  );
}
