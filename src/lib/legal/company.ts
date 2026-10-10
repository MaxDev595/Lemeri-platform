// Company details shown in the legal pages. Set them in the Worker variables:
// LEMIRI_LEGAL_ENTITY (e.g. «ИП Иванов Иван Иванович»), LEMIRI_LEGAL_ID (ИИН/БИН/ОГРН),
// LEMIRI_LEGAL_ADDRESS, LEMIRI_LEGAL_COUNTRY, LEMIRI_SUPPORT_EMAIL.
export function legalCompany() {
  const e = process.env;
  return {
    entity: e.LEMIRI_LEGAL_ENTITY?.trim() || "Lemiri AI",
    id: e.LEMIRI_LEGAL_ID?.trim() || "",
    address: e.LEMIRI_LEGAL_ADDRESS?.trim() || "",
    country: e.LEMIRI_LEGAL_COUNTRY?.trim() || "",
    email: e.LEMIRI_SUPPORT_EMAIL?.trim() || "",
    site: (e.PUBLIC_APP_URL || "https://lemeriai.com").replace(/\/+$/, ""),
    updated: "10.10.2026",
  };
}
export type LegalCompany = ReturnType<typeof legalCompany>;
