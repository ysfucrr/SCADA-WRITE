export {};

declare global {
    interface Window {
        electron: {
            isElectronEnvironment: boolean;
        };
    }
}