"use strict";

let _ = require("lodash");
let Table = require("easy-table");

// let $fs = require("mz/fs");
// let $gstd = require("get-stdin");
const { latexArtifact, simToLatex } = require("../artifacts");

let r2 = (x) => Math.round(x * 1000) / 1000;

let eventLoop = (options, schedule, logger) => {
  let origSchedule = _.cloneDeep(schedule);
  schedule.tasks = _.map(schedule.tasks, (t) => {
    t.origvrt = t.vrt;
    return t;
  });
  let state = {
    schedule: schedule,
    curr: undefined,
    rbt: [],
    blocked: [],
    vmin: 0,
  };

  let timer = {
    walltime: -schedule.timer,
    events: [],
    show: [0, 1, 4, 6, 8, 9, 10, 11],
  };

  let updateTimer = () => {
    timer.walltime = r2(timer.walltime + schedule.timer);
    // console.log(timer);

    /* Prioritize tasktick */

    let firable_tt = _.remove(
      timer.events,
      (e) => e.type === "_task_tick" && r2(e.deadline) <= timer.walltime
    );
    _.map(firable_tt, (e) => {
      e.func(e.arg);
    });

    let firable = _.remove(
      timer.events,
      (e) => r2(e.deadline) <= timer.walltime
    );
    _.map(firable, (e) => {
      e.func(e.arg);
    });

    state.rbt = _.map(state.rbt, (t) => {
      t.q = schedslice(t);
      if (!_.isUndefined(state.curr) && state.curr.index == t.index) {
        t.R = "X";
      } else {
        t.R = "";
      }
      return t;
    });

    // if (_.includes(timer.show, timer.walltime)) {
    logger.debug(`at time @${timer.walltime}`);
    logger.debug(Table.print(state.rbt));
    logger.debug(Table.print(state.blocked));
    // }
    let res = {
      rbt: _.cloneDeep(state.rbt),
      blocked: _.cloneDeep(state.blocked),
      time: timer.walltime,
    };
    _.map(schedule.tasks, (t) => (t.vrtlwk = { message: "", color: "black" }));
    return res;
  };

  let resched = (msg) => {
    logger.debug(msg);
    if (state.rbt.length > 0) {
      state.curr = state.rbt[0];
      state.curr.prev = state.curr.sum;
      logger.debug(
        `scheduled task ${state.curr.name} to run @${timer.walltime}`
      );
    } else {
      state.curr = undefined;
    }
  };

  let sumlambda = () => _.reduce(state.rbt, (a, t) => a + t.lambda, 0);

  let schedslice = (t) => schedule.class.latency * (t.lambda / sumlambda());

  let _start_task = (t) => {
    t.sum = 0;
    // on clone, dont use a lower vrt that would interrupt the current process
    state.rbt.push(t);
    if (_.isUndefined(t.vrt)) {
      t.vrt = state.vmin + schedslice(t) / t.lambda;
    }
    if (
      state.curr === undefined ||
      t.vrt + schedule.class.wgup * (t.lambda / sumlambda()) < state.curr.vrt
    ) {
      resched(`starting task ${t.name} @${timer.walltime}`);
    }
  };

  let removeFromRbt = (task) => {
    state.rbt = _.filter(state.rbt, (o) => !(o.index == task.index));
  };

  let addBlocked = (task) => {
    state.blocked.splice(0, 0, task);
  };

  let removeBlocked = (task) => {
    state.blocked = _.filter(state.blocked, (o) => !(o.index == task.index));
  };

  let addToRbt = (task) => {
    state.rbt.splice(_.sortedLastIndexBy(state.rbt, task, "vrt"), 0, task);
  };

  let _wakeup = (tw) => {
    logger.debug(`Call to wake up ${tw.name} at @${timer.walltime}`);
    tw.vrt = Math.max(tw.vrt, state.vmin - schedule.class.latency / 2);
    removeBlocked(tw);
    addToRbt(tw);
    let v = r2(tw.vrt + schedule.class.wgup * (tw.lambda / sumlambda()));
    if (!_.isUndefined(state.curr)) {
      tw.vrtlwk = { message: `${v} < ${state.curr.vrt}`, color: "black" };
    }
    if (state.curr !== undefined && v < state.curr.vrt) {
      tw.vrtlwk = {
        message: `(${v} < ${state.curr.vrt}) \\checkmark`,
        color: "blue",
      };
      logger.debug(`HEII ${v} ---- ${state.curr.vrt}`);
      removeFromRbt(state.curr);
      addToRbt(state.curr);
      resched(`Waking up task ${tw.name} @${timer.walltime}`);
    } else {
      if (state.curr === undefined)
        resched(`Waking up task ${tw.name} @${timer.walltime}`);
      else {
        tw.vrtlwk = {
          message: `(${v} < ${state.curr.vrt}) \\times`,
          color: "red",
        };
      }
    }
  };

  let _setTimeout = (func, ms, arg, type) => {
    timer.events.push({ deadline: ms + timer.walltime, func, arg, type });
  };

  let _task_tick = () => {
    _setTimeout(_task_tick, schedule.timer, undefined, "_task_tick");
    if (state.curr !== undefined) {
      let delta = schedule.timer;

      if (state.curr.events[0] >= delta) {
        state.curr.sum = r2(state.curr.sum + delta);
        state.curr.vrt = r2(state.curr.vrt + delta / state.curr.lambda);
        state.vmin = _.minBy(state.rbt, "vrt").vrt;
        state.curr.events[0] = r2(state.curr.events[0] - delta);
        if (
          state.curr.sum - state.curr.prev == schedslice(state.curr) &&
          state.curr.events[0] > 0
        ) {
          removeFromRbt(state.curr);
          addToRbt(state.curr);
          resched(
            `task ${state.curr.name} finished quantum @${timer.walltime}`
          );
        }
      }
      if (state.curr.events[0] === 0) {
        // must sleep
        let ts = state.curr;
        removeFromRbt(state.curr);
        addBlocked(state.curr);
        let blocktime = ts.events[1];
        if (!_.isUndefined(blocktime)) {
          _setTimeout(_wakeup, blocktime, ts, "_wakeup");
          ts.events = _.tail(_.tail(ts.events));
        } else {
          let v = _.find(schedule.tasks, (t) => t.index === state.curr.index);
          v.exited = timer.walltime;
          v = _.find(origSchedule.tasks, (t) => t.index === state.curr.index);
          v.exited = timer.walltime;
        }
        resched(`putting task to sleep ${ts.name} @${timer.walltime}`);
      }
    }
  };

  _.map(schedule.tasks, (t) => {
    _setTimeout(_start_task, t.start, t, "_start_task");
  });
  _setTimeout(_task_tick, 2 * schedule.timer, undefined, "_task_tick");

  let sim = _.map(
    _.range(1, schedule.runfor / schedule.timer + 2),
    updateTimer
  );

  return {
    rawSimData: sim, // <- this is the one being tested by jest
    simData: serialiseSim(sim, schedule), // this is the serialised format
  };
};

let printData = ({ schedule }) => {
  let taskevents = _.join(
    _.map(schedule.tasks, (t) => {
      return [
        `\\item task ${t.name} (\\lambda = ${t.lambda}) inizia a ${t.start}, ` +
          _.join(
            _.map(t.events, (e, i) =>
              i % 2 === 0 ? `gira per ${e}` : `in attesa per ${e}`
            ),
            ", "
          ),
      ];
    }),
    "\n"
  );
  let s = `
  \\begin{itemize}
  \\item Dati scheduling: $\\bar{\\tau}$= ${schedule.class.latency}, $\\mu$=${schedule.class.mingran}, $\\omega$=${schedule.class.wgup}
  ${taskevents}
  \\end{itemize}`;

  let legendAbove = `Schedule data: $\\bar{\\tau}$= ${schedule.class.latency}, $\\mu$=${schedule.class.mingran}, $\\omega$=${schedule.class.wgup}`;

  return { blankData: s, legendAbove };
};

let serialiseSim = (sim, schedule) => {
  // assume we always start from 0
  let getTaskState = (task, t) => {
    let { rbt, blocked } = _.find(sim, ({ time }) => {
      return time === t;
    });
    let findRunning = () => _.find(rbt, (t) => t.R === "X");
    let tr = findRunning();
    if (rbt.length > 0 && tr.index === task.index) {
      return {
        event: "RAN",
        tstart: t,
        tend: t + schedule.timer,
        index: tr.index,
        vrt: tr.vrt,
        sum: tr.sum,
        q: tr.q,
        p: tr.prev,
        aboveSlot: tr.vrtlwk,
      };
    } else {
      let tt;
      if (!_.isUndefined((tt = _.find(rbt, (t) => t.index === task.index)))) {
        return {
          event: "RUNNABLE",
          tstart: t,
          tend: t + schedule.timer,
          index: tt.index,
          vrt: tt.vrt,
          sum: tt.sum,
          aboveSlot: tt.vrtlwk,
        };
      } else {
        if (
          !_.isUndefined((tt = _.find(blocked, (t) => t.index === task.index)))
        ) {
          if (_.isUndefined(tt.exited) || t < tt.exited) {
            return {
              event: "BLOCKED",
              tstart: t,
              tend: t + schedule.timer,
              index: tt.index,
              vrt: tt.vrt,
              sum: tt.sum,
              aboveSlot: tt.vrtlwk,
            };
          } else {
            return {
              event: "EXITED",
              tstart: t,
              tend: t + schedule.timer,
              index: tt.index,
              vrt: tt.vrt,
              sum: tt.sum,
              aboveSlot: tt.vrtlwk,
            };
          }
        }
      }
    }
  };
  let tasksToShow = _.flattenDeep(
    _.map(sim, ({ time }, i) => {
      let ranOrBlockedAtTime = _.map(schedule.tasks, (t) =>
        getTaskState(t, time)
      );
      if (i < sim.length - 1) {
        ranOrBlockedAtTime = _.map(ranOrBlockedAtTime, (t) => {
          let nextState = getTaskState(t, r2(time + schedule.timer));
          t.belowSlot = nextState.vrt;
          t.sumend = nextState.sum;
          if (t.event === "RAN") {
            t.inSlot = `${t.sumend - t.p}/${r2(t.q)}`;
          }
          delete t.sumend;
          delete t.vrt;
          delete t.sum;
          delete t.q;
          delete t.p;
          return t;
        });
      }
      return ranOrBlockedAtTime;
    })
  );

  let scheddata = printData({ sim, schedule });

  schedule.tasks = _.map(schedule.tasks, (t) => {
    let { index, name, origvrt, lambda, start, exited } = t;
    return {
      index,
      name,
      start,
      exited,
      legendBelowTask1: `$\\rho=$${origvrt}`,
      legendBelowTask2: `$\\lambda=$${lambda}`,
    };
  });
  // delete schedule.class;
  return {
    timeline: tasksToShow,
    schedule,
    scheddata,
  };
};

let exportLatex = (options, sim, logger) => {
  return {
    complete: latexArtifact(
      simToLatex(sim, { blank: false }, logger),
      "rt diagram",
      "standalone",
      "pdflatex",
      "-r varwidth"
    ),
    blank: latexArtifact(
      simToLatex(sim, { blank: true }, logger),
      "rt diagram blank",
      "standalone",
      "pdflatex",
      "-r varwidth"
    ),
    data: latexArtifact(
      sim.scheddata.blankData,
      "data table",
      "standalone",
      "pdflatex",
      "-r varwidth"
    ),
  };
};

module.exports = { eventLoop, exportLatex };
