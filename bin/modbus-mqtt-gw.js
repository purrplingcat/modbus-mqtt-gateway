#! /usr/bin/env node
/* eslint-disable @typescript-eslint/no-var-requires */
"use strict";
if (require.main !== module) {
    throw new Error("Can't import application executor as module");
}

const runner = require("../runtime/node-app");
const manifest = require("../package.json");

runner(manifest);
