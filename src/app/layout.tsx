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

export const metadata: Metadata = { title: "Lemiri AI — цифровые сотрудники для бизнеса", description: "Единая платформа для AI-сотрудников, диалогов, лидов, записей и базы знаний." };
export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#fbfbfd" }, { media: "(prefers-color-scheme: dark)", color: "#0e0f13" }] };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru" data-theme="light"><body>{children}<RevealRoot/></body></html>;
}
