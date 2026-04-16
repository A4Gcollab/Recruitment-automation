import { CandidatesTable } from "./candidates-table";

export const metadata = {
  title: "Dashboard · A4G Recruitment",
};

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6 md:p-10">
      <CandidatesTable />
    </main>
  );
}
