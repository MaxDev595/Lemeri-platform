// Details shown in the legal pages. Personal data of the owner (full name, ID
// number, home address, country) is intentionally never shown here: the pages
// name the service only. LEMIRI_SUPPORT_EMAIL sets the contact address.
export function legalCompany() {
  const e = process.env;
  return {
    entity: "Lemeri AI",
    id: "",
    address: "",
    country: "",
    email: e.LEMIRI_SUPPORT_EMAIL?.trim() || "",
    site: (e.PUBLIC_APP_URL || "https://lemeriai.com").replace(/\/+$/, ""),
    updated: "19.10.2026",
  };
}
export type LegalCompany = ReturnType<typeof legalCompany>;
