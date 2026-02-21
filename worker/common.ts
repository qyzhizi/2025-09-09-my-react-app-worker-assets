import { sign } from 'hono/jwt'
import { ValidationError } from '@/types/error';

// 添加验证函数
function matchGitRepoName(repoName: string): boolean {
  const pattern = /^[a-zA-Z0-9_.-]+$/

  return pattern.test(repoName);
}

function matchGitRepoFullName(repoName: string): boolean {
  const pattern = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/

  return pattern.test(repoName);
}

export function validateGitRepoFullName(repoName: string): void {
  // 检查文件路径是否为空
  if (!repoName) {
    return;
  }

  // 检查文件名是否合法
  if (!matchGitRepoFullName(repoName)) {
    console.log("matchGitRepoName(repoName): ", matchGitRepoName(repoName))
    throw new ValidationError("github repo name 格式错误！请检查后重试");
  }
}
export function validateGitRepoName(repoName: string): void {
  // 检查文件路径是否为空
  if (!repoName) {
    return;
  }

  // 检查文件名是否合法
  if (!matchGitRepoName(repoName)) {
    console.log("matchGitRepoName(repoName): ", matchGitRepoName(repoName))
    throw new ValidationError("github repo name 格式错误！请检查后重试");
  }
}

export async function generateJWT(appId: string, privateKey: string) {
  const now = Math.floor(Date.now() / 1000)

  const payload = {
    iat: now - 60,
    exp: now + 600,
    iss: appId,
  }

  const token = await sign(payload, privateKey, 'RS256')
  return token
}

export async function getTitleFromContent(content: string): Promise<string> {
  // 使用正则表达式提取标题
  let title = '';
  
  // 首先查找 #que 后面跟一个空格的行
  const queMatch = content.match(/^\x20{0,2}#que(?:\x20)(.*)$/m);
  if (queMatch && queMatch[1]) {
      title = queMatch[1].trim();
  } else {
      // 如果没有找到 #que，查找第一个 “# “后面跟一个空格的行
      const headerMatch = content.match(/^\x20{0,2}#(?:\x20)(.*)$/m);
      if (headerMatch && headerMatch[1]) {
          title = headerMatch[1].trim();
      }
  }
  console.log("Extracted title: ", title)
  console.log("Extracted content length: ", content?.length || 0)
  return title ;
}