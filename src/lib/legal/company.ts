// Details shown in the legal pages. Personal data of the owner (full name, ID
// number, home address, country) is intentionally never shown here: the pages
// name the service only. Contact addresses come from lib/platform/contacts.ts
// (LEMIRI_SUPPORT_EMAIL can still override the support address).
import { SUPPORT_EMAIL, WORK_EMAIL } from "../platform/contacts.ts";

export function legalCompany() {
  const e = process.env;
  return {
    entity: "Lemeri AI",
    id: "",
    address: "",
    country: "",
    email: e.LEMIRI_SUPPORT_EMAIL?.trim() || SUPPORT_EMAIL,
    workEmail: WORK_EMAIL,
    site: (e.PUBLIC_APP_URL || "https://lemeriai.com").replace(/\/+$/, ""),
    updated: "19.10.2026",
  };
}
export type LegalCompany = ReturnType<typeof legalCompany>;
