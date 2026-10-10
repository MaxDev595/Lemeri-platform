import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Landing } from "@/components/landing";
import { getSessionUser } from "@/lib/auth/session";
import { getPublicLocale } from "@/lib/public-locale";

export const metadata: Metadata = {
  title: "Lemiri AI — ИИ-продавец для сайта, который работает 24/7",
  description: "ИИ-продавец консультирует посетителей сайта, помогает выбрать товары и услуги, отвечает на вопросы и собирает заявки — автоматически.",
};

// lemeriai.com: signed-in users go straight to the platform, everyone else sees the landing.
export default async function Home({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  if (await getSessionUser()) redirect("/app");
  const locale = await getPublicLocale((await searchParams).lang);
  return <Landing locale={locale} />;
}
