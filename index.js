#!/usr/bin/env node
"use strict";

const { program } = require("@caporal/core");
const { runAndSave } = require("./lib/cfs/lib");
// const { schedule } = require("./lib/" + name + "/fixtures");
let $fs = require("mz/fs");
let $gstd = require("get-stdin");

let main = () => {
  program
    .name("aos-sched")
    .description("Create temporal diagrams of AOS realtime schedulers")
    .argument("<sched>", "Scheduler to use", {
      // just provide an array
      validator: ["cfs"],
    })
    .argument("[json]", "JSON file or stdin")
    .option(
      "-s, --save <string>",
      "save data with in files with prefix <string>"
    )
    .option("-w, --draw", "produce only latex code for drawing")
    .action((args, options) => {
      let datap = args.json ? $fs.readFile(args.json, "utf8") : $gstd();
      datap.then(JSON.parse).then((sched) => {
        runAndSave(options, sched);
      });
    });
  program.run(process.argv);
};

main();
