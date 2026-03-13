import { simpleGit, SimpleGit } from 'simple-git';
import { GitInfo } from '../types';

export async function scanGit(rootPath: string): Promise<GitInfo | null> {
  const git: SimpleGit = simpleGit(rootPath);

  try {
    const isRepo = await git.checkIsRepo();
    if (!isRepo) return null;

    // Branch
    const branchResult = await git.branch();
    const branch = branchResult.current || 'unknown';

    // Recent commits — last 15, one line each
    const logResult = await git.log({ '--oneline': null, '-n': '15' } as any);
    const recentCommits = logResult.all.map(c => c.message).slice(0, 15);

    // Uncommitted changes
    const status = await git.status();
    const hasUncommitted = !status.isClean();

    // Remote URL
    let remoteUrl: string | null = null;
    try {
      const remotes = await git.getRemotes(true);
      const origin = remotes.find(r => r.name === 'origin');
      remoteUrl = origin?.refs?.fetch || null;
      // Strip credentials if present
      if (remoteUrl) {
        remoteUrl = remoteUrl.replace(/https?:\/\/[^@]+@/, 'https://');
      }
    } catch { /* no remote */ }

    return { branch, recentCommits, hasUncommitted, remoteUrl };
  } catch {
    return null;
  }
}
