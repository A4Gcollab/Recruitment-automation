import { CampaignList } from "./campaign-list";

export const metadata = {
  title: "Campaigns · A4G Recruitment",
};

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <main className="flex-1 overflow-y-auto p-8">
      <CampaignList />
    </main>
  );
}
