import { Gift, Mail } from "lucide-react";
import { CONTACT_LABELS, LAUNCH_OFFER, launchOfferMailto, SOCIAL_LINKS, SUPPORT_EMAIL, WORK_EMAIL } from "@/lib/platform/contacts";

/** «В честь запуска» block — landing pricing and «Тариф и оплата» in the cabinet. */
export function LaunchOffer({ locale, compact = false, id }: { locale: "ru" | "en"; compact?: boolean; id?: string }) {
  const offer = LAUNCH_OFFER[locale];
  return <section id={id} className={compact ? "launchOffer compact" : "launchOffer"} aria-label={offer.headline}>
    <div className="launchHead"><span className="launchIcon"><Gift size={compact ? 16 : 18} /></span><h3>{offer.headline}</h3></div>
    <ul>{offer.items.map(item => <li key={item.name}><b>{item.name}</b> — {item.text}</li>)}</ul>
    <a className="primary launchCta" href={launchOfferMailto(locale)}><Mail size={15} />{offer.cta}: {WORK_EMAIL}</a>
  </section>;
}

/** Support and partnership addresses — landing footer, cabinet, legal pages. */
export function ContactEmails({ locale, className = "contactEmails" }: { locale: "ru" | "en"; className?: string }) {
  const l = CONTACT_LABELS[locale];
  return <p className={className}>
    <span>{l.support}: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></span>
    <span>{l.work}: <a href={`mailto:${WORK_EMAIL}`}>{WORK_EMAIL}</a></span>
  </p>;
}

// Brand glyphs (lucide has no brand icons). 24×24, currentColor.
const SOCIAL_ICONS: Record<(typeof SOCIAL_LINKS)[number]["key"], React.ReactNode> = {
  telegram: <path d="M21.4 4.6 2.9 11.7c-1.3.5-1.2 1.2-.2 1.5l4.7 1.5 1.8 5.6c.2.6.4.8.8.8.4 0 .6-.2.9-.5l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8l3.1-14.6c.3-1.3-.5-1.9-1.4-1.5ZM9.6 14.4l9-5.7c.4-.3.8-.1.5.2l-7.7 7-.3 3.2-1.5-4.7Z" fill="currentColor" />,
  instagram: <><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="17.4" cy="6.6" r="1.2" fill="currentColor" /></>,
  tiktok: <path d="M16.6 3c.4 2.3 1.9 3.9 4.2 4.1v3.2c-1.5.1-2.9-.3-4.2-1.1v6.3c0 3.7-3.1 6.3-6.6 5.8-2.6-.4-4.6-2.6-4.7-5.3-.2-3.4 2.8-6.2 6.2-5.8v3.3c-1.5-.4-3 .7-3 2.3 0 1.4 1.2 2.5 2.6 2.4 1.3-.1 2.3-1.2 2.3-2.5V3h3.2Z" fill="currentColor" />,
};

/** Telegram, Instagram, TikTok — landing footer. */
export function SocialLinks({ className = "socialLinks" }: { className?: string }) {
  return <nav className={className} aria-label="Lemeri AI social">
    {SOCIAL_LINKS.map(item => <a key={item.key} href={item.url} target="_blank" rel="noopener noreferrer" aria-label={item.label} title={item.label}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">{SOCIAL_ICONS[item.key]}</svg>
    </a>)}
  </nav>;
}
