import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalPage } from "@/components/legal-page";
import { legalCompany } from "@/lib/legal/company";
import { privacyText, refundText, termsText } from "@/lib/legal/texts";
import { getPublicLocale } from "@/lib/public-locale";

// /legal/terms, /legal/privacy, /legal/refund (/terms, /privacy, /refund redirect here).
// One route for the three documents keeps the Worker bundle small.
const DOCS = { terms: termsText, privacy: privacyText, refund: refundText } as const;
export const metadata: Metadata = { title: "Lemeri AI — legal" };

export default async function Page({ params, searchParams }: { params: Promise<{ doc: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { doc } = await params;
  const make = Object.hasOwn(DOCS, doc) ? DOCS[doc as keyof typeof DOCS] : undefined;
  if (!make) notFound();
  const locale = await getPublicLocale((await searchParams).lang);
  const company = legalCompany();
  const text = make(locale, company);
  return <LegalPage locale={locale} title={text.title} intro={text.intro} sections={text.sections} company={company}/>;
}
