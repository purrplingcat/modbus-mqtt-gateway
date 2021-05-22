/* eslint-disable @typescript-eslint/no-var-requires */
const scope = {
    runner: "node-app",
    runnerVersion: "1.0.0",
    browser: typeof window === "object",
    node: typeof process === "object" && typeof process.versions === "object" && process.versions.node != null,
};

global.NODE_APP = true;
global.application = global.application || scope;

if (!global.NODE_APP || global.application == null) {
    throw new Error("Node application runtime is not initialized");
}

if (scope.runner != global.application.runner || scope.runnerVersion !== global.application.runnerVersion) {
    throw new Error("Runner conflict");
}

function loadAssembly(entrypoint) {
    return require(process.cwd() + "/" + entrypoint);
}

function execute(app, entryFunc = "default") {
    if (typeof app.errorHandler === "function") {
        process.on("unhandledRejection", app.errorHandler);
        process.on("uncaughtException", app.errorHandler);
    }

    app[entryFunc].call(app, process.argv.slice(1), process.env);
}

function runner(manifest, entry = null) {
    if (typeof manifest !== "object") {
        throw new Error("Invalid application manifest");
    }

    const _entry = entry || manifest.entry || manifest.main || "app.js:default";
    const [entryFile, entryFunc = "default"] = _entry.split(":");
    const app = loadAssembly(entryFile);

    if (typeof app.default !== "function") {
        throw new Error(`Application ${manifest.name} is not runnable`);
    }

    global.application.entry = `${entryFile}:${entryFunc}`;
    global.application.manifest = manifest;
    global.application.instance = app;
    execute(app, entryFunc);
}

module.exports = runner;
