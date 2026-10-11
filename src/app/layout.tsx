import type { Metadata, Viewport } from "next";
import { RevealRoot } from "@/components/motion";
import "@/styles/tokens.css";
import "@/styles/base.css";
import "@/styles/motion.css";
import "@/styles/shell.css";
import "@/styles/select.css";
import "@/styles/dashboard.css";
import "@/styles/views.css";
import "@/styles/auth.css";
import "@/styles/onboarding.css";
import "@/styles/widget.css";
import "@/styles/assistant.css";
import "@/styles/crm.css";
import "@/styles/site-install.css";
import "@/styles/team.css";
import "@/styles/sales.css";
import "@/styles/landing.css";

const description = "ИИ-продавец на сайте: консультирует посетителей, помогает выбрать товары и услуги и собирает заявки 24/7.";
export const metadata: Metadata = {
  metadataBase: new URL("https://lemeriai.com"),
  title: "Lemeri AI — ИИ-продавец для вашего сайта",
  description,
  applicationName: "Lemeri AI",
  openGraph: { type: "website", siteName: "Lemeri AI", title: "Lemeri AI — ИИ-продавец для вашего сайта", description, url: "/", locale: "ru_RU" },
  twitter: { card: "summary", title: "Lemeri AI — ИИ-продавец для вашего сайта", description },
};
export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#fbfbfd" }, { media: "(prefers-color-scheme: dark)", color: "#0e0f13" }] };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru" data-theme="light"><body>{children}<RevealRoot/></body></html>;
}
