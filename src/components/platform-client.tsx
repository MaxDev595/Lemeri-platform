"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { Platform as PlatformType } from "./platform";
import { LemiriGlyph } from "./logo";

// The cabinet is rendered in the browser only. It sits behind login (no SEO), and
// keeping it out of server rendering keeps the size-limited Worker bundle small.
const Platform = dynamic(() => import("./platform").then(m => m.Platform), {
  ssr: false,
  loading: () => <div className="appBoot" role="status" aria-label="Lemiri AI"><LemiriGlyph size={40}/><span/></div>,
});

export function PlatformClient(props: ComponentProps<typeof PlatformType>) {
  return <Platform {...props}/>;
}
