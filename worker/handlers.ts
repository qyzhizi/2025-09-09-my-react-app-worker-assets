import type { Context } from "hono";


export const durableHello = async (c: Context) => {
		// Create a `DurableObjectId` for an instance of the `MemoflowDurableObject`
		// class named "foo". Requests from all Workers to the instance named
		// "foo" will go to a single globally unique Durable Object instance.
		const id: DurableObjectId = c.env.MY_DURABLE_OBJECT.idFromName("foo");

		// Create a stub to open a communication channel with the Durable
		// Object instance.
		const stub = c.env.MY_DURABLE_OBJECT.get(id);

		// Call the `sayHello()` RPC method on the stub to invoke the method on
		// the remote Durable Object instance
		const greeting = await stub.sayHello("world, lzp");
    return c.json({ commitMessage: greeting });
};