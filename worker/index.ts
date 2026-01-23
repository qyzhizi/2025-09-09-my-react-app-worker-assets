import { Hono} from 'hono'

import { BASE_PATH } from "@/ConstVar";
import { configAuthMiddleware } from "@/middleware/auth";
import { 
  githubAppAuthCallbackHandler, 
  githubAuthHandler, 
  setGithubRepoHandler,
  helloZValidator,
  helloHandler,
  getUsersHandler,
  getUserAvatarUrlHandler,
  durableHelloHandler,
  addLogHandler,
  getAuthInfoHandler,
  GithubLoginHandler,
  initRefreshTokenHandler,
  logoutHandler,
  getUserInfoHandler,
  getSyncVaultsHandler,
  updateSyncVaultsHandler,
  githubAppConfigureHandler,
  saveRepoAndTestConnectionHandler,
  getGitHubRepoNameHandler,
 } from '@/handler'

 import { GITHUB_LOGIN_PATH } from "./ConstVar";

const app = new Hono().basePath(BASE_PATH)
configAuthMiddleware(app); // 配置认证中间件

// GitHub login 处理函数, oAuth 回调路由
app.get(GITHUB_LOGIN_PATH, GithubLoginHandler);
// 前端登录后应立即调用此路由初始化 refresh_token
app.get('/init-refresh-token', initRefreshTokenHandler);
// 登出路由
app.post('/logout', logoutHandler);

// GitHub-app 授权路由
app.get('/github-app/auth', githubAuthHandler)
// GitHub-app 授权回调路由
app.get('/github-app-auth-callback', githubAppAuthCallbackHandler)

app.get('/github-app-configure', githubAppConfigureHandler)

app.get('/auth/me', getAuthInfoHandler)

app.post('/github/set-repo', setGithubRepoHandler)

app.get('/hello', helloZValidator, helloHandler)

app.get('/durable-hello', durableHelloHandler);

app.get("/users", getUsersHandler);

app.get("/user/avatar-url", getUserAvatarUrlHandler);
app.get("/user/info", getUserInfoHandler);

app.post('/diary-log/addlog', addLogHandler)
app.get('/get-sync-vaults', getSyncVaultsHandler);
app.post('/update-sync-vaults', updateSyncVaultsHandler);
app.post('/save-repo-and-test-connection', saveRepoAndTestConnectionHandler)
app.get('/get-github-repo-name', getGitHubRepoNameHandler)
// 独立导出 scheduled 方法
export default {
  fetch: app.fetch,  // 将 app.fetch 作为 fetch 函数导出
} satisfies ExportedHandler<Env>;

export { MyDurableObject } from './DurableController'