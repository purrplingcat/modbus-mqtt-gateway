/* eslint-disable @typescript-eslint/no-explicit-any */
declare const NODE_APP: boolean;
declare const application: NodeApplication.Application;

declare namespace NodeApplication {
    export interface Application {
        manifest: AppManifest;
        instance: any;
        runner: string;
        runnerVersion: string;
        entry: string;
    }

    export interface AppManifest {
        name: string;
        version: string;
        author: string;
        license?: string;
    }
}
