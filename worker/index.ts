import { Hono} from 'hono'

import { BASE_PATH } from "./ConstVar";
import { 
  configAuthMiddleware,
  registerGithubLoginHandler
} from "./middleware/auth";
import { 
  githubAppAuthCallbackHandler, 
  githubAuthHandler, 
  setGithubRepoHandler,
  helloZValidator,
  helloHandler,
  getUsers,
  durableHello
 } from './handler'

const app = new Hono().basePath(BASE_PATH)
configAuthMiddleware(app); // 配置认证中间件

// 绑定路由
// 注册 GitHub 授权回调路由
registerGithubLoginHandler(app); // 注册 GitHub login 处理函数

app.get('/github-app/auth', githubAuthHandler)
app.get('/github-app-auth-callback', githubAppAuthCallbackHandler)

app.post('/github/set-repo', setGithubRepoHandler)

app.get('/hello', helloZValidator, helloHandler)

app.get('/durable-hello', durableHello);

app.get("/users", getUsers);

// 独立导出 scheduled 方法
export default {
  fetch: app.fetch,  // 将 app.fetch 作为 fetch 函数导出
} satisfies ExportedHandler<Env>;

export { MyDurableObject } from './DurableController'