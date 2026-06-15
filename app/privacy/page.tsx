export const metadata = {
  title: "Privacy Policy — A4G Recruitment",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-sm leading-relaxed text-foreground">
      <h1 className="mb-2 text-2xl font-bold">Privacy Policy</h1>
      <p className="mb-8 text-muted-foreground">Last updated: June 2026</p>

      <section className="mb-6">
        <h2 className="mb-2 text-base font-semibold">1. Who we are</h2>
        <p>
          A4G Recruitment is operated by Omysha Foundation. This tool is used
          internally to manage recruitment outreach for internship and job
          programmes.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-base font-semibold">2. Data we collect</h2>
        <p>We collect the following information about applicants:</p>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>Full name and contact details (email, phone number)</li>
          <li>LinkedIn profile URL and professional background</li>
          <li>Application date and role applied for</li>
          <li>WhatsApp message history related to recruitment</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-base font-semibold">3. How we use your data</h2>
        <p>Data is used solely for:</p>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>Processing and tracking job/internship applications</li>
          <li>Sending recruitment-related communications via email and WhatsApp</li>
          <li>Internal reporting and shortlisting</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-base font-semibold">4. WhatsApp messaging</h2>
        <p>
          We use the WhatsApp Business API (Meta) to send template messages to
          applicants who have expressed interest in our programmes. Messages are
          sent only to candidates who have applied through our official channels.
          You can opt out at any time by replying STOP.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-base font-semibold">5. Data retention</h2>
        <p>
          Applicant data is retained for up to 12 months after the recruitment
          cycle ends, after which it is deleted from our systems.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-base font-semibold">6. Third parties</h2>
        <p>We use the following third-party services:</p>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>Meta (WhatsApp Business API) — for messaging</li>
          <li>Google (Sheets, Gmail) — for data import and email</li>
        </ul>
        <p className="mt-2">We do not sell or share your data with any other third parties.</p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-base font-semibold">7. Contact</h2>
        <p>
          For any privacy-related queries, contact us at{" "}
          <a
            href="mailto:recruitments.a4g@gmail.com"
            className="underline text-primary"
          >
            recruitments.a4g@gmail.com
          </a>
          .
        </p>
      </section>
    </main>
  );
}
