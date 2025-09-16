import { Hono } from "hono";
import { durableHello } from "./handlers";
export { MyDurableObject } from './DurableController'
const app = new Hono();

// 绑定路由
app.get('/api/durable-hello', durableHello);

// 独立导出 scheduled 方法
export default {
  fetch: app.fetch,  // 将 app.fetch 作为 fetch 函数导出
} satisfies ExportedHandler<Env>;
