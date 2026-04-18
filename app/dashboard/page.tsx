import { CampaignList } from "./campaign-list";

export const metadata = {
  title: "Campaigns · A4G Recruitment",
};

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6 md:p-10">
      <CampaignList />
    </main>
  );
}
