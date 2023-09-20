import _ from "lodash";
import { Logger } from "winston";
import {
  Plan,
  Schedule,
  Task,
  TaskSlot,
  ScheduledTask,
  NoClass,
  Maybe,
} from "../types";

type CFSTask = Task & {
  lambda: number;
  events: number[];
  vrt: number;
  // the following are going to be gradually added during the simulation, but are not required at ingress
  origvrt: number;
  sum: number;
  prev: number;
  vrtlwk: {
    message: string;
    color: string;
  };
  q: number;
  R: string;
};

type CFSTaskSlot = TaskSlot & {
  vrt: number;
  sum: number;
  p: number;
  q: number;
};

type CFSClass = { wgup: number; latency: number; mingran: number };

type CFSPlan = Plan<CFSTask, CFSClass>;

type CFSState = {
  plan: CFSPlan;
  curr?: CFSTask;
  rbt: CFSTask[];
  blocked: CFSTask[];
  vmin?: number;
};

type CFSStateSnapshot = {
  rbt: CFSTask[];
  blocked: CFSTask[];
  time: number;
};

type CFSTimer = {
  walltime: number;
  events: any[];
};

type CFSEventLoopRes = {
  rawSimData: CFSStateSnapshot[];
  simData: Schedule;
};

let Table = require("easy-table");

let r2 = (x: number) => Math.round(x * 1000) / 1000;

let eventLoop = (
  options: any,
  plan: CFSPlan,
  logger: Logger
): CFSEventLoopRes => {
  let origPlan = _.cloneDeep(plan) as CFSPlan;

  plan.tasks = _.map(plan.tasks, (t) => {
    t.origvrt = t.vrt;
    return t;
  });
  let state: CFSState = {
    plan: plan,
    curr: undefined,
    rbt: [],
    blocked: [],
    vmin: 0,
  };

  let timer: CFSTimer = {
    walltime: -plan.timer,
    events: [],
  };

  let updateTimer = (): CFSStateSnapshot => {
    timer.walltime = r2(timer.walltime + plan.timer);
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
    let res: CFSStateSnapshot = {
      rbt: _.cloneDeep(state.rbt),
      blocked: _.cloneDeep(state.blocked),
      time: timer.walltime,
    };
    _.map(plan.tasks, (t) => (t.vrtlwk = { message: "", color: "black" }));
    return res;
  };

  let resched = (msg: string) => {
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

  let schedslice = (t: CFSTask) =>
    plan.class.latency * (t.lambda / sumlambda());

  let _start_task = (t: CFSTask) => {
    t.sum = 0;
    // on clone, dont use a lower vrt that would interrupt the current process
    state.rbt.push(t);
    if (_.isUndefined(t.vrt)) {
      t.vrt = _.defaultTo(state.vmin, 0) + schedslice(t) / t.lambda;
    }
    if (
      state.curr === undefined ||
      t.vrt + plan.class.wgup * (t.lambda / sumlambda()) < state.curr.vrt
    ) {
      resched(`starting task ${t.name} @${timer.walltime}`);
    }
  };

  let removeFromRbt = (task: CFSTask) => {
    state.rbt = _.filter(state.rbt, (o) => !(o.index == task.index));
  };

  let addBlocked = (task: CFSTask) => {
    state.blocked.splice(0, 0, task);
  };

  let removeBlocked = (task: CFSTask) => {
    state.blocked = _.filter(state.blocked, (o) => !(o.index == task.index));
  };

  let addToRbt = (task: CFSTask) => {
    state.rbt.splice(_.sortedLastIndexBy(state.rbt, task, "vrt"), 0, task);
  };

  let _wakeup = (tw: CFSTask) => {
    logger.debug(`Call to wake up ${tw.name} at @${timer.walltime}`);
    tw.vrt = Math.max(tw.vrt, (state.vmin || 0) - plan.class.latency / 2);
    removeBlocked(tw);
    addToRbt(tw);
    let v = r2(tw.vrt + plan.class.wgup * (tw.lambda / sumlambda()));
    if (!_.isUndefined(state.curr)) {
      tw.vrtlwk = { message: `${v} < ${state.curr.vrt}`, color: "black" };
    }
    if (state.curr !== undefined && v < state.curr.vrt) {
      tw.vrtlwk = {
        message: `(${v} < ${state.curr.vrt}) OK`,
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
          message: `(${v} < ${state.curr.vrt}) X`,
          color: "red",
        };
      }
    }
  };

  let _setTimeout = (func, ms: number, arg, type) => {
    timer.events.push({ deadline: ms + timer.walltime, func, arg, type });
  };

  let _task_tick = () => {
    _setTimeout(_task_tick, plan.timer, undefined, "_task_tick");
    if (state.curr !== undefined) {
      let delta = plan.timer;

      if (state.curr.events[0] >= delta) {
        state.curr.sum = r2(state.curr.sum + delta);
        state.curr.vrt = r2(state.curr.vrt + delta / state.curr.lambda);
        state.vmin = _.defaultTo(_.minBy(state.rbt, "vrt"), { vrt: 0 }).vrt;
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
          let v = _.find(
            plan.tasks,
            (t) => t.index === (state.curr ? state.curr.index : 0)
          );
          if (v) {
            v.exited = timer.walltime;
          }

          v = _.find(
            origPlan.tasks,
            (t) => t.index === (state.curr ? state.curr.index : 0)
          );
          if (v) {
            v.exited = timer.walltime;
          }
        }
        resched(`putting task to sleep ${ts.name} @${timer.walltime}`);
      }
    }
  };

  _.map(plan.tasks, (t) => {
    _setTimeout(_start_task, t.start, t, "_start_task");
  });
  _setTimeout(_task_tick, 2 * plan.timer, undefined, "_task_tick");

  let sim = _.map(_.range(1, plan.runfor / plan.timer + 2), updateTimer);

  return {
    rawSimData: sim, // <- this is the one being tested by jest
    simData: serialiseSim(sim, plan), // this is the serialised format
  };
};

let printData = (plan: CFSPlan) => {
  let taskevents = _.join(
    _.map(plan.tasks, (t) => {
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
  \\item Dati scheduling: $\\bar{\\tau}$= ${plan.class.latency}, $\\mu$=${plan.class.mingran}, $\\omega$=${plan.class.wgup}
  ${taskevents}
  \\end{itemize}`;

  let legendAbove = `Schedule data: $\\bar{\\tau}$= ${plan.class.latency}, $\\mu$=${plan.class.mingran}, $\\omega$=${plan.class.wgup}`;

  return { blankData: s, legendAbove };
};

let serialiseSim = (
  cfsStateSnapshots: CFSStateSnapshot[],
  cfsPlan: CFSPlan
): Schedule => {
  // assume we always start from 0

  let getCFSTaskSlot = (tindex: number, t: number): Maybe<CFSTaskSlot> => {
    let { rbt, blocked } = _.defaultTo(
      _.find(cfsStateSnapshots, ({ time }) => {
        return time === t;
      }),
      { rbt: [], blocked: [] }
    );
    let findRunning = () => _.find(rbt, (t) => t.R === "X");
    let tr = findRunning();
    if (tr) {
      if (rbt.length > 0 && tr.index === tindex) {
        return {
          event: "RAN",
          tstart: t,
          tend: t + cfsPlan.timer,
          index: tr.index,
          vrt: tr.vrt,
          sum: tr.sum,
          q: tr.q,
          p: tr.prev,
          aboveSlot: tr.vrtlwk,
          belowSlot: "",
          inSlot: "",
        };
      } else {
        let tt: CFSTask | undefined;
        if (!_.isUndefined((tt = _.find(rbt, (t) => t.index === tindex)))) {
          return {
            event: "RUNNABLE",
            tstart: t,
            tend: t + cfsPlan.timer,
            index: tt.index,
            vrt: tt.vrt,
            sum: tt.sum,
            aboveSlot: tt.vrtlwk,
            belowSlot: "",
            inSlot: "",
            q: 0,
            p: 0,
          };
        } else {
          if (
            !_.isUndefined((tt = _.find(blocked, (t) => t.index === tindex)))
          ) {
            if (_.isUndefined(tt.exited) || t < tt.exited) {
              return {
                event: "BLOCKED",
                tstart: t,
                tend: t + cfsPlan.timer,
                index: tt.index,
                vrt: tt.vrt,
                sum: tt.sum,
                aboveSlot: tt.vrtlwk,
                belowSlot: "",
                inSlot: "",
                q: 0,
                p: 0,
              };
            } else {
              return {
                event: "EXITED",
                tstart: t,
                tend: t + cfsPlan.timer,
                index: tt.index,
                vrt: tt.vrt,
                sum: tt.sum,
                aboveSlot: tt.vrtlwk,
                belowSlot: "",
                inSlot: "",
                q: 0,
                p: 0,
              };
            }
          }
        }
      }
    }
  };

  let tasksToShow: TaskSlot[];

  tasksToShow = _.flattenDeep(
    _.map(cfsStateSnapshots, ({ time }, i) => {
      let cfsTaskSlots = _.map(cfsPlan.tasks, (t) =>
        getCFSTaskSlot(t.index, time)
      ); // get all taskslots at time t

      let taskSlots: TaskSlot[];

      if (i < cfsStateSnapshots.length - 1) {
        taskSlots = _.filter(
          _.map(cfsTaskSlots, (t) => {
            let nextState: Maybe<CFSTaskSlot>;
            if (t) {
              nextState = getCFSTaskSlot(t.index, r2(time + cfsPlan.timer));
              let tslot: TaskSlot = t as TaskSlot;
              if (nextState) {
                tslot.belowSlot = nextState.vrt + "";
                tslot.inSlot =
                  t.event === "RAN" ? `${nextState.sum - t.p}/${r2(t.q)}` : "";
              }
              return tslot;
            }
          })
        ) as TaskSlot[];
        return taskSlots;
      } else return [];
    })
  );

  let scheddata = printData(cfsPlan);
  let plan: Plan<ScheduledTask, NoClass> = {
    timer: cfsPlan.timer,
    runfor: cfsPlan.runfor,
    graphics: cfsPlan.graphics,
    tasks: [],
    class: {},
  };

  plan.tasks = _.map(cfsPlan.tasks, (t) => {
    return {
      ...t,
      description: [`$\\rho=$${t.origvrt}`, `$\\lambda=$${t.lambda}`],
    };
  });

  return {
    timeline: tasksToShow,
    plan: plan,
    scheddata,
  };
};

export { eventLoop };
