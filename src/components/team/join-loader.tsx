"use client";

import dynamic from "next/dynamic";

// The join screen (positions catalog) renders in the browser only, so it adds nothing to the Worker bundle.
export const JoinCompanyLoader = dynamic(() => import("./join-company").then(m => m.JoinCompany), { ssr: false, loading: () => <p className="joinMuted">…</p> });
