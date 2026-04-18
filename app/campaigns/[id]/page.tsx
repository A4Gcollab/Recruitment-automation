import { CampaignDetailView } from "./campaign-detail-view";

export const metadata = {
  title: "Campaign · A4G Recruitment",
};

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6 md:p-10">
      <CampaignDetailView campaignId={id} />
    </main>
  );
}
