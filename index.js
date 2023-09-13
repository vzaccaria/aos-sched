#!/usr/bin/env node
"use strict";

const { program } = require("@caporal/core");

let _ = require("lodash");

let sims = {};
let tests = {};
let latex = {};

sims.cfs = require("./lib/cfs/lib").eventLoop;
latex.cfs = require("./lib/cfs/lib").exportLatex;
tests.cfs = require("./lib/cfs/fixtures").schedule;

let $fs = require("mz/fs");
let $gstd = require("get-stdin");

function showArray(arrayOfObjects) {
  const jsonStringArray = arrayOfObjects.map((obj) => JSON.stringify(obj));
  return `[${jsonStringArray.join("\n,")}]`;
}

let main = () => {
  program
    .name("aos-sched")
    .description("Create temporal diagrams of AOS realtime schedulers")
    .command("dump", "Dump out examples")
    .argument("<sched>", "Scheduler to use", {
      validator: ["cfs"],
    })
    .argument("<num>", "Example number", {
      validator: program.NUMBER,
    })
    .action(({ logger, args }) => {
      console.log(JSON.stringify(tests[args.sched][args.num]));
    })
    .command("simulate", "Simulate provided schedule")
    .argument("<sched>", "Scheduler to use", {
      validator: ["cfs"],
    })
    .argument("[json]", "JSON file or stdin")
    .action(({ logger, args, options }) => {
      let datap = args.json ? $fs.readFile(args.json, "utf8") : $gstd();
      datap.then(JSON.parse).then((sched) => {
        let sim = sims[args.sched](options, sched, logger).simData;
        console.log(JSON.stringify(sim, null, 2));
      });
    })
    .command("export", "Export simulation data to available formats")
    .argument("<artifact>", "Artifact name")
    .argument("[json]", "JSON file or stdin")
    .action(({ logger, args, options }) => {
      let datap = args.json ? $fs.readFile(args.json, "utf8") : $gstd();
      datap.then(JSON.parse).then((sim) => {
        console.log(latex["cfs"](options, sim, logger)[args.artifact].code);
      });
    });
  program.run();
};

main();
