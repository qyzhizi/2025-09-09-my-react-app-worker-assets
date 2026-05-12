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

export function getMetaDataFromContent(content: string): { title: string; date: string } {
  let title = '';
  let date = '';

  // Parse metadata in HTML comment frontmatter:
  // <!--
  // title: xxx
  // date: 2026-03-31T04:33:46.585Z
  // -->
  const frontmatterMatch = content.match(/<!--([\s\S]*?)-->/);
  if (frontmatterMatch && frontmatterMatch[1]) {
    const frontmatter = frontmatterMatch[1];
    const frontmatterTitleMatch = frontmatter.match(/^\s*title\s*:\s*(.+)\s*$/m);
    const frontmatterDateMatch = frontmatter.match(/^\s*date\s*:\s*(.+)\s*$/m);

    if (frontmatterTitleMatch && frontmatterTitleMatch[1]) {
      title = frontmatterTitleMatch[1].trim();
    }
    if (frontmatterDateMatch && frontmatterDateMatch[1]) {
      date = normalizeDate(frontmatterDateMatch[1].trim());
    }
  }

  if(!title && date){
    return { title, date }
  }
  // Fallback to markdown headings when frontmatter title is absent.
  if (!title && !date) {
    const queMatch = content.match(/^\x20{0,2}#que(?:\x20)(.*)$/m);
    if (queMatch && queMatch[1]) {
      title = queMatch[1].trim();
    } else {
      const headerMatch = content.match(/^\x20{0,2}#(?:\x20)(.*)$/m);
      if (headerMatch && headerMatch[1]) {
        title = headerMatch[1].trim();
      }
    }
  }

  console.log('Extracted title and date:', { title, date });
  return { title, date };
}

export function normalizeGitHubPath(path: string): string {
    return path
        .replace(/\\/g, '/')        // Replace backslashes with forward slashes
        .replace(/\/+/g, '/')       // Merge multiple slashes
        .replace(/^\/|\/$/g, '');   // Remove leading and trailing slashes
}

export function normalizeDate(dateStr: string) {
  // ISO 直接返回
  if (/^\d{4}-\d{2}-\d{2}T/.test(dateStr)) {
      return new Date(dateStr).toISOString();
  }

  // yyyy/m/d hh:mm:ss
  let m = dateStr.match(
      /^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})$/
  );

  if (m) {
      const [, y, mon, d, h, min, s] = m;

      return new Date(Date.UTC(
          Number(y),
          Number(mon) - 1,
          Number(d),
          Number(h),
          Number(min),
          Number(s)
      )).toISOString();
  }

  // m/d/yyyy hh:mm:ss AM/PM
  m = dateStr.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(AM|PM)$/i
  );

  if (m) {
      let [, mon, d, y, h, min, s, ap] = m;

      let hour = Number(h);

      if (ap.toUpperCase() === 'PM' && hour !== 12) {
          hour += 12;
      }

      if (ap.toUpperCase() === 'AM' && hour === 12) {
          hour = 0;
      }

      return new Date(Date.UTC(
          Number(y),
          Number(mon) - 1,
          Number(d),
          hour,
          Number(min),
          Number(s)
      )).toISOString();
  }

  // 中文格式：2023年4月17日 上午2:37:45
  m = dateStr.match(
      /^(\d{4})年(\d{1,2})月(\d{1,2})日\s+(上午|下午)(\d{1,2}):(\d{2}):(\d{2})$/
  );

  if (m) {
      let [, y, mon, d, period, h, min, s] = m;

      let hour = Number(h);

      if (period === '下午' && hour !== 12) {
          hour += 12;
      }

      if (period === '上午' && hour === 12) {
          hour = 0;
      }

      return new Date(Date.UTC(
          Number(y),
          Number(mon) - 1,
          Number(d),
          hour,
          Number(min),
          Number(s)
      )).toISOString();
  }

  throw new Error(`Unsupported date format: ${dateStr}`);
}