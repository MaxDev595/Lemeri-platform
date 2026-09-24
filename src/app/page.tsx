import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Landing } from "@/components/landing";
import { getSessionUser } from "@/lib/auth/session";
import { getPublicLocale } from "@/lib/public-locale";

export const metadata: Metadata = {
  title: "Lemiri AI — AI-сотрудник, который не пропускает ни одного клиента",
  description: "Отвечает клиентам, собирает заявки, записывает на услуги и передаёт сложные диалоги команде. Запуск за 15 минут.",
};

export default async function Home({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  if (await getSessionUser()) redirect("/app");
  const locale = await getPublicLocale((await searchParams).lang);
  return <Landing locale={locale} />;
}
