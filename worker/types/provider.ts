export const Provider = {
    GitHub: 0,
    Google: 1,
};

export type ProviderType = (typeof Provider)[keyof typeof Provider];

export interface VaultMetaInfo {
  folderIndexInVault: string;
  fileIndexInFolder: string;
  currentTitleIndexCount: string;
  indexOfTitleIndexFiles: string;
  markdownFileList: string[];
  lastTitleIndexFileContentLines: string[];
}