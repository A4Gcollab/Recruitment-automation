export const metadata = {
  title: "Messages · A4G Recruitment",
};

export const dynamic = "force-dynamic";

import { MessagesInbox } from "./messages-inbox";

export default function MessagesPage() {
  return (
    <main className="flex-1 overflow-y-auto p-8">
      <MessagesInbox />
    </main>
  );
}
