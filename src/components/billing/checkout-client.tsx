"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { CheckoutPage as CheckoutPageType } from "./checkout-page";
import { LemiriGlyph } from "../logo";

// Checkout renders in the browser only (behind login, no SEO) — keeps it out of the
// size-limited Worker bundle, like the cabinet (platform-client.tsx).
const CheckoutPage = dynamic(() => import("./checkout-page").then(m => m.CheckoutPage), {
  ssr: false,
  loading: () => <div className="appBoot" role="status" aria-label="Lemiri AI"><LemiriGlyph size={40}/><span/></div>,
});

export function CheckoutClient(props: ComponentProps<typeof CheckoutPageType>) {
  return <CheckoutPage {...props}/>;
}
