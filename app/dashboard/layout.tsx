import { DashboardGuard } from "./dashboard-guard";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardGuard>{children}</DashboardGuard>;
}
