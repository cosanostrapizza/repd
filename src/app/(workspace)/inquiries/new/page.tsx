import Link from "next/link";
import { InquiryForm } from "@/components/agent/intake-forms";
import { getAIConfiguration } from "@/lib/ai/provider";
import { requireContext } from "@/lib/auth";

export const metadata = { title: "Add inquiry" };

export default async function NewInquiryPage() {
  await requireContext();
  const configuration = getAIConfiguration();
  return (
    <div className="content narrow-content">
      <div className="page-head">
        <div>
          <p className="eyebrow">New opportunity</p>
          <h1>Give Repd the inquiry.</h1>
          <p className="lede">
            Paste the message as you received it. Repd preserves the original,
            proposes an understanding, and waits for your review before changing
            your business records.
          </p>
        </div>
        <Link href="/jobs" className="button ghost">
          Cancel
        </Link>
      </div>
      <section className="card card-pad">
        <InquiryForm
          configured={configuration.configured}
          model={configuration.model}
        />
      </section>
      <p className="trust-note">
        Nothing extracted from this message is treated as confirmed until you
        accept it. No reply is sent automatically.
      </p>
    </div>
  );
}
