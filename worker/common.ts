// 在 handler.ts 文件顶部添加导入（如果还没有的话）
import { ValidationError } from '@/types/error';

// 添加验证函数
function matchGitRepoName(repoName: string): boolean {
  const pattern = /^[a-zA-Z0-9_.-]+$/

  return pattern.test(repoName);
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
