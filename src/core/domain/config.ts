export interface PommentCoreConfig {
  moderationInitiallyHidden: boolean;
  avatarHash: 'md5' | 'sha256';
}

export const defaultCoreConfig: PommentCoreConfig = {
  moderationInitiallyHidden: false,
  avatarHash: 'md5',
};
