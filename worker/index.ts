import { Hono } from "hono";
import { durableHello } from "./handlers";
import { findManyUsers } from "./infrastructure/user";

export { MyDurableObject } from './DurableController'
const app = new Hono();

// 绑定路由
app.get('/api/durable-hello', durableHello);

app.get("/api/users", async (c) => {
	const users = await findManyUsers(c);
	return c.json({ users: users });
});

// 独立导出 scheduled 方法
export default {
  fetch: app.fetch,  // 将 app.fetch 作为 fetch 函数导出
} satisfies ExportedHandler<Env>;
