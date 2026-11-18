"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { redactAnalyticsUrl } from "@/lib/telemetry/redactUrl";

/** Vercel Web Analytics (sin cookies). Solo envía datos en despliegues de Vercel; en local no hace nada. */
export function VercelAnalytics() {
  return <Analytics beforeSend={(event: BeforeSendEvent) => ({ ...event, url: redactAnalyticsUrl(event.url) })} />;
}
