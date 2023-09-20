#!/usr/bin/env bun

import { program } from "@caporal/core";

import { exportLatex } from "./lib/artifacts";
import { Schedule } from "./lib/types";

interface Tests {
  cfs: any[];
}

interface Simulators {
  cfs: any;
}

let tests: Tests = { cfs: [] };
let sims: Simulators = { cfs: null };

tests.cfs = require("./lib/cfs/fixtures").schedule;
sims.cfs = require("./lib/cfs/lib").eventLoop;

let $fs = require("mz/fs");
let $gstd = require("get-stdin");

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
    .action(({ args }) => {
      let n: number = parseInt(args.num + "");
      console.log(JSON.stringify(tests[args.sched + ""][n]));
    })
    .command("simulate", "Simulate provided schedule")
    .argument("<sched>", "Scheduler to use", {
      validator: ["cfs"],
    })
    .argument("[json]", "JSON file or stdin")
    .action(({ logger, args, options }) => {
      let datap = args.json ? $fs.readFile(args.json, "utf8") : $gstd();
      datap.then(JSON.parse).then((sched: string) => {
        let sim = sims[args.sched + ""](options, sched, logger).simData;
        console.log(JSON.stringify(sim, null, 2));
      });
    })
    .command("export", "Export simulation data to available formats")
    .argument("<artifact>", "Artifact name")
    .argument("[json]", "JSON file or stdin")
    .action(({ logger, args }) => {
      let datap = args.json ? $fs.readFile(args.json, "utf8") : $gstd();
      datap.then(JSON.parse).then((sim: Schedule) => {
        console.log(exportLatex(sim, logger)[args.artifact + ""].code);
      });
    });
  program.run();
};

main();
