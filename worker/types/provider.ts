export const Provider = {
    GitHub: 0,
    Google: 1,
};

export type ProviderType = (typeof Provider)[keyof typeof Provider];