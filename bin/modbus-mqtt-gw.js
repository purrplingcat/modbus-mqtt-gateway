#! /usr/bin/env node
"use strict"
const app = require("../lib/app");

if (app.errorHandler) {
    process.on("unhandledRejection", app.errorHandler);
    process.on("uncaughtException", app.errorHandler);
}

app.default(process.argv.slice(1), process.env);
