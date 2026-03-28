declare const __APP_VERSION__: string;

interface ImportMetaEnv {
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '@tauri-apps/plugin-updater' {
  export interface CheckOptions {
    headers?: HeadersInit;
    timeout?: number;
    proxy?: string;
    target?: string;
  }

  export interface DownloadOptions {
    headers?: HeadersInit;
    timeout?: number;
  }

  export type DownloadEvent =
    | {
        event: 'Started';
        data: {
          contentLength?: number;
        };
      }
    | {
        event: 'Progress';
        data: {
          chunkLength: number;
        };
      }
    | {
        event: 'Finished';
      };

  export class Update {
    available: boolean;
    currentVersion: string;
    version: string;
    date?: string;
    body?: string;
    rawJson: Record<string, unknown>;
    download(onEvent?: (progress: DownloadEvent) => void, options?: DownloadOptions): Promise<void>;
    install(): Promise<void>;
    downloadAndInstall(onEvent?: (progress: DownloadEvent) => void, options?: DownloadOptions): Promise<void>;
    close(): Promise<void>;
  }

  export function check(options?: CheckOptions): Promise<Update | null>;
}
