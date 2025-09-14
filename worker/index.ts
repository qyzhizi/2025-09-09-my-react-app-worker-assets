export default {
  async fetch(request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/name") {
      return new Response(JSON.stringify({ name: "Cloudflare" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return env.ASSETS.fetch(request);
    // return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
