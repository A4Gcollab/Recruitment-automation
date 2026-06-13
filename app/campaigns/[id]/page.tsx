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
  return <CampaignDetailView campaignId={id} />;
}
