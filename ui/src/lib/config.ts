export const PACKAGE_ID = import.meta.env.VITE_PACKAGE_ID as string;
export const DIARY_ID = import.meta.env.VITE_DIARY_ID as string;

export const isConfigured = Boolean(PACKAGE_ID && DIARY_ID);
