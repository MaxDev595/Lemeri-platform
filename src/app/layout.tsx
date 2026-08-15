import type { Metadata } from "next";
import "./globals.css";
import "./product.css";

export const metadata: Metadata = { title: "Lemiri AI — цифровые сотрудники для бизнеса", description: "Единая платформа для AI-сотрудников, диалогов, лидов, записей и базы знаний." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru" data-theme="light"><body>{children}</body></html>;
}
