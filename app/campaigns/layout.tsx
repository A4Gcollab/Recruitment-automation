import { AuthGuard } from "@/components/auth-guard";

export default function CampaignsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthGuard>{children}</AuthGuard>;
}
