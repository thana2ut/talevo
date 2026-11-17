// No public HTTP endpoint: Cloudflare Cron calls the app through a service binding.
const pushDispatcher = {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil((async () => {
      const response = await env.TALEVO_APP.fetch("https://talevo.talevo-thana2ut.workers.dev/api/push/dispatch", {
        method: "POST",
        headers: { "x-talevo-push-secret": env.PUSH_DISPATCH_SECRET },
      });
      if (!response.ok) throw new Error(`push_dispatch_http_${response.status}`);
      console.log(JSON.stringify({ event: "push_dispatch_complete", status: response.status }));
    })());
  },
  async fetch() { return new Response(null, { status: 404 }); },
};

export default pushDispatcher;
