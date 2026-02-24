import { sign } from 'hono/jwt'
import { ValidationError } from '@/types/error';

// Add validation function
function matchGitRepoName(repoName: string): boolean {
  const pattern = /^[a-zA-Z0-9_.-]+$/

  return pattern.test(repoName);
}

function matchGitRepoFullName(repoName: string): boolean {
  const pattern = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/

  return pattern.test(repoName);
}

export function validateGitRepoFullName(repoName: string): void {
  // Check if the file path is empty
  if (!repoName) {
    return;
  }

  // Check if the file name is legal
  if (!matchGitRepoFullName(repoName)) {
    console.log("matchGitRepoName(repoName): ", matchGitRepoName(repoName))
    throw new ValidationError("github repo name Format error! Please check and try again");
  }
}
export function validateGitRepoName(repoName: string): void {
  // Check if the file path is empty
  if (!repoName) {
    return;
  }

  // Check if the file name is legal
  if (!matchGitRepoName(repoName)) {
    console.log("matchGitRepoName(repoName): ", matchGitRepoName(repoName))
    throw new ValidationError("github repo name Format error! Please check and try again");
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
  // Extract titles using regular expressions
  let title = '';
  
  // First look for lines with #que followed by a space
  const queMatch = content.match(/^\x20{0,2}#que(?:\x20)(.*)$/m);
  if (queMatch && queMatch[1]) {
      title = queMatch[1].trim();
  } else {
      // If #que is not found, search for the first "#" line followed by a space
      const headerMatch = content.match(/^\x20{0,2}#(?:\x20)(.*)$/m);
      if (headerMatch && headerMatch[1]) {
          title = headerMatch[1].trim();
      }
  }
  console.log("Extracted title: ", title)
  console.log("Extracted content length: ", content?.length || 0)
  return title ;
}