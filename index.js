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
    .argument("<sched>", "Scheduler to use", {
      validator: ["cfs"],
    })
    .argument("[json]", "JSON file or stdin")
    .option("-e, --example <num>", "Print out one of the json input examples", {
      validator: program.NUMBER,
    })
    .option(
      "-t, --latex <name>",
      "Export latex artifact <name> instead of raw json simulation",
      {
        validator: program.STRING,
      }
    )
    // .option(
    //   "-s, --save <string>",
    //   "save data with in files with prefix <string>"
    // )
    // .option("-w, --draw", "produce only latex code for drawing")
    .action(({ logger, args, options }) => {
      if (!_.isUndefined(options.example)) {
        console.log(JSON.stringify(tests[args.sched][options.example]));
        return;
      }
      let datap = args.json ? $fs.readFile(args.json, "utf8") : $gstd();
      datap.then(JSON.parse).then((sched) => {
        let sim = sims[args.sched](options, sched, logger);
        if (!_.isUndefined(options.latex)) {
          console.log(
            latex[args.sched](options, sim, logger)[options.latex].code
          );
        } else {
          console.log(JSON.stringify(sim, null, 2));
        }
      });
    });
  program.run();
};

main();
