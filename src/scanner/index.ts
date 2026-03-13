import { ScanResult } from '../types';
import { scanPackage } from './package';
import { scanFolderTree, scanComponents, scanConventions, scanConfigs } from './files';
import { scanGit } from './git';

export async function scan(rootPath: string): Promise<ScanResult> {
  // Run all scanners — some are async, some sync
  const [components, conventions, git] = await Promise.all([
    scanComponents(rootPath),
    scanConventions(rootPath),
    scanGit(rootPath),
  ]);

  const { meta, stack } = scanPackage(rootPath);
  const structure = scanFolderTree(rootPath);
  const configs = scanConfigs(rootPath);

  return {
    meta,
    stack,
    structure,
    components,
    git,
    conventions,
    configs,
    scannedAt: new Date().toISOString(),
    rootPath,
  };
}
