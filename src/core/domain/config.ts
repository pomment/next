export interface PommentCoreConfig {
  moderationInitiallyHidden: boolean;
  avatarHash: 'md5' | 'sha256';
  captcha: {
    enabled: boolean;
    minimumScore: number;
  };
}

export const defaultCoreConfig: PommentCoreConfig = {
  moderationInitiallyHidden: false,
  avatarHash: 'md5',
  captcha: {
    enabled: false,
    minimumScore: 0.5,
  },
};
