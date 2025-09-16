export { MyDurableObject } from './DurableController'

export const durableHello = async (env: Env) => {
		// Create a `DurableObjectId` for an instance of the `MemoflowDurableObject`
		// class named "foo". Requests from all Workers to the instance named
		// "foo" will go to a single globally unique Durable Object instance.
		const id: DurableObjectId = env.MY_DURABLE_OBJECT.idFromName("foo");

		// Create a stub to open a communication channel with the Durable
		// Object instance.
		const stub = env.MY_DURABLE_OBJECT.get(id);

		// Call the `sayHello()` RPC method on the stub to invoke the method on
		// the remote Durable Object instance
		const greeting = await stub.sayHello("world, lzp");
    return greeting;
};

export default {
  async fetch(request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/name") {
      return new Response(JSON.stringify({ name: "Cloudflare" }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.pathname === "/api/durable-hello") {
      const greeting = await durableHello(env);
      return new Response(JSON.stringify({ commitMessage: greeting }));
    }

    return env.ASSETS.fetch(request);
    // return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
