import { bindings, defineConfig, defineWorker } from "cf/config";
import deployment from "./config/cloudflare-deployment.json" with { type: "json" };

export default defineConfig({
  accountId: "5a001ddfb0da267963f6df23e61a3e34",
  worker: defineWorker({
    name: "talevo",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-11-16",
    compatibilityFlags: ["nodejs_compat"],
    workersDev: true,
    observability: {
      enabled: true,
      redactQueryString: true,
      logs: { enabled: true, invocationLogs: true, headSamplingRate: 1 },
      traces: { enabled: true, headSamplingRate: 0.01 },
    },
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      NEXT_PUBLIC_SUPABASE_URL: bindings.secret(),
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: bindings.secret(),
      SUPABASE_SECRET_KEY: bindings.secret(),
      TALEVO_AI_PROVIDER: bindings.secret(),
      GROQ_API_KEY: bindings.secret(),
      TALEVO_AI_MODEL: bindings.secret(),
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: bindings.secret(),
      ...(deployment.pushDelivery === "external"
        ? { TALEVO_PUSH_DELIVERY: bindings.secret() }
        : {
          VAPID_PRIVATE_KEY: bindings.secret(),
          VAPID_SUBJECT: bindings.secret(),
          PUSH_DISPATCH_SECRET: bindings.secret(),
        }),
      TALEVO_CLOUDFLARE: bindings.secret(),
    },
  }),
});
