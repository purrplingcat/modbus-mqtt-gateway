/* eslint-disable @typescript-eslint/no-var-requires */
const scope = {
    runner: "node-app",
    runnerVersion: "1.0.0",
    browser: typeof window === "object",
    node: typeof process === "object" && typeof process.versions === "object" && process.versions.node != null,
};

global = typeof global === "object" ? global : typeof window === "object" ? window : {};
global.NODE_APP = true;
global.application = scope;

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
