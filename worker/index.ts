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
  deleteLogHandler,
  editLogHandler,
  getAuthInfoHandler,
  GithubLoginHandler,
  initRefreshTokenHandler,
  logoutHandler,
  getUserInfoHandler,
  githubAppConfigureHandler,
  getGitHubRepoInfoHandler,
  getVaultInfoHandler,
  githubAppSetupHandler,
  getGitHubAppInstallationReposHandler,
  setStoragePreferenceHandler,
  getStoragePreferenceHandler,
  getDODatabaseStatusHandler,
  resetDoKeyStorageAndSqliteHandler,
  getArticleContentListHandler,
  durableSearchSimilarTitlesInVectorIndexHandler,
  setVectorIndexProviderHandler,
  getVectorIndexProviderHandler
} from '@/handlers/mainHandler'

 import {
  getQdrantSettingsHandler,
  saveAndInitQdrantCollectionForUserHandler,
  fetchQdrantCollectioinStatsHandler,
  UpsertCollectionPointsHandler,
  updateQdrantCollectionOptimizersHandler
} from '@/handlers/qdrantHandler'

import { getCloudflareVectorIndexStatusHandler,
  upsertVectorsToCloudflareIndexHandler,
  resetCloudflareNamespaceVectorCountsHandler,
 } from '@/handlers/cloudflareVectorIndexHandler'

 import {
  searchCommitsHandler,
  saveRepoAndTestConnectionHandler,
  checkIfTitlesExistsOnGitHubVaultHandler
} from '@/handlers/githubAppHandler'


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
app.delete('/diary-log/:id', deleteLogHandler)
app.put('/diary-log/:id', editLogHandler)
app.get('/article/content/list', getArticleContentListHandler)
app.post('/storage/preference', setStoragePreferenceHandler)
app.get('/storage/preference', getStoragePreferenceHandler)
app.post('/save-repo-and-test-connection', saveRepoAndTestConnectionHandler)
app.get('/get-github-repo-info', getGitHubRepoInfoHandler)
app.post('/check-titles-on-github-vault', checkIfTitlesExistsOnGitHubVaultHandler)
app.get('/vault/info', getVaultInfoHandler)
app.get('/github-app-setup', githubAppSetupHandler)
app.get('/get-githubapp-installation-repositories', getGitHubAppInstallationReposHandler)
app.get('/do-database-status', getDODatabaseStatusHandler)
app.get('/reset-durable-object', resetDoKeyStorageAndSqliteHandler)
app.get('/github-app/search-commits', searchCommitsHandler)
app.post('/search-similar-titles', durableSearchSimilarTitlesInVectorIndexHandler)
app.get('/get-qdrant-settings', getQdrantSettingsHandler)
app.post('/save-and-init-qdrant-collection', saveAndInitQdrantCollectionForUserHandler)
app.get('/get-qdrant-collection-stats', fetchQdrantCollectioinStatsHandler)
app.get('/get-cloudflare-vector-index-status', getCloudflareVectorIndexStatusHandler)
app.get('/reset-cloudflare-namespace-vector-counts', resetCloudflareNamespaceVectorCountsHandler)
app.post('/set-vector-index-provider', setVectorIndexProviderHandler)
app.get('/get-vector-index-provider', getVectorIndexProviderHandler)
app.post('/upsert-collection-points', UpsertCollectionPointsHandler)
app.post('/upsert-vectors-to-cloudflare-index', upsertVectorsToCloudflareIndexHandler)
app.post('/update-collection-optimizers', updateQdrantCollectionOptimizersHandler)
// Export scheduled method independently
export default {
  fetch: app.fetch,  // Export app.fetch as fetch function
} satisfies ExportedHandler<Env>;

export { MyDurableObject } from './durable/DurableController'