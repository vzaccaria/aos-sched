import _ from "lodash";
import { Logger } from "winston";
import {
  Plan,
  ScheduleProducer,
  Schedule,
  Task,
  TaskSlot,
  ScheduledTask,
  NoClass,
  Maybe,
} from "../types";

type CFSPlannedTask = Task & {
  lambda: number;
  vrt: number;
  events: number[];
};

type CFSTaskState = CFSPlannedTask & {
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

type CFSClass = {
  type: string;
  wgup: number;
  latency: number;
  mingran: number;
};

type CFSPlan = Plan<CFSPlannedTask, CFSClass>;
type CFSStateTaskInfo = Plan<CFSTaskState, CFSClass>;

type CFSState = {
  origplan: CFSPlan;
  taskinfo: CFSStateTaskInfo;
  curr?: CFSTaskState;
  rbt: CFSTaskState[];
  blocked: CFSTaskState[];
  vmin?: number;
};

type CFSTaskStateSnapshot = {
  rbt: CFSTaskState[];
  blocked: CFSTaskState[];
  time: number;
};

type CFSTimer = {
  walltime: number;
  events: any[];
};

type CFSEventLoopRes = {
  rawSimData: CFSTaskStateSnapshot[];
  simData: Schedule;
};

let Table = require("easy-table");

let r2 = (x: number) => Math.round(x * 1000) / 1000;

let eventLoop = (
  options: any,
  origplan: CFSPlan,
  logger: Logger
): CFSEventLoopRes => {
  let taskstates = _.cloneDeep(origplan) as CFSStateTaskInfo;

  taskstates.tasks = _.map(taskstates.tasks, (t) => {
    t.origvrt = t.vrt;
    return t;
  });

  let schedstate: CFSState = {
    origplan: origplan,
    taskinfo: taskstates,
    curr: undefined,
    rbt: [],
    blocked: [],
    vmin: 0,
  };

  let timer: CFSTimer = {
    walltime: -taskstates.timer,
    events: [],
  };

  let updateTimer = (): CFSTaskStateSnapshot => {
    timer.walltime = r2(timer.walltime + taskstates.timer);
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

    schedstate.rbt = _.map(schedstate.rbt, (t) => {
      t.q = schedslice(t);
      if (!_.isUndefined(schedstate.curr) && schedstate.curr.index == t.index) {
        t.R = "X";
      } else {
        t.R = "";
      }
      return t;
    });

    // if (_.includes(timer.show, timer.walltime)) {
    logger.debug(`at time @${timer.walltime}`);
    logger.debug(Table.print(schedstate.rbt));
    logger.debug(Table.print(schedstate.blocked));
    // }
    let res: CFSTaskStateSnapshot = {
      rbt: _.cloneDeep(schedstate.rbt),
      blocked: _.cloneDeep(schedstate.blocked),
      time: timer.walltime,
    };
    _.map(
      taskstates.tasks,
      (t) => (t.vrtlwk = { message: "", color: "black" })
    );
    return res;
  };

  let resched = (msg: string) => {
    logger.debug(msg);
    if (schedstate.rbt.length > 0) {
      schedstate.curr = schedstate.rbt[0];
      schedstate.curr.prev = schedstate.curr.sum;
      logger.debug(
        `scheduled task ${schedstate.curr.name} to run @${timer.walltime}`
      );
    } else {
      schedstate.curr = undefined;
    }
  };

  let sumlambda = () => _.reduce(schedstate.rbt, (a, t) => a + t.lambda, 0);

  let schedslice = (t: CFSTaskState) =>
    taskstates.class.latency * (t.lambda / sumlambda());

  let _start_task = (t: CFSTaskState) => {
    t.sum = 0;
    // on clone, dont use a lower vrt that would interrupt the current process
    schedstate.rbt.push(t);
    if (_.isUndefined(t.vrt)) {
      t.vrt = _.defaultTo(schedstate.vmin, 0) + schedslice(t) / t.lambda;
    }
    if (
      schedstate.curr === undefined ||
      t.vrt + taskstates.class.wgup * (t.lambda / sumlambda()) <
        schedstate.curr.vrt
    ) {
      resched(`starting task ${t.name} @${timer.walltime}`);
    }
  };

  let removeFromRbt = (task: CFSTaskState) => {
    schedstate.rbt = _.filter(schedstate.rbt, (o) => !(o.index == task.index));
  };

  let addBlocked = (task: CFSTaskState) => {
    schedstate.blocked.splice(0, 0, task);
  };

  let removeBlocked = (task: CFSTaskState) => {
    schedstate.blocked = _.filter(
      schedstate.blocked,
      (o) => !(o.index == task.index)
    );
  };

  let addToRbt = (task: CFSTaskState) => {
    schedstate.rbt.splice(
      _.sortedLastIndexBy(schedstate.rbt, task, "vrt"),
      0,
      task
    );
  };

  let _wakeup = (tw: CFSTaskState) => {
    logger.debug(`Call to wake up ${tw.name} at @${timer.walltime}`);
    tw.vrt = Math.max(
      tw.vrt,
      (schedstate.vmin || 0) - taskstates.class.latency / 2
    );
    removeBlocked(tw);
    addToRbt(tw);
    let v = r2(tw.vrt + taskstates.class.wgup * (tw.lambda / sumlambda()));
    if (!_.isUndefined(schedstate.curr)) {
      tw.vrtlwk = { message: `${v} < ${schedstate.curr.vrt}`, color: "black" };
    }
    if (schedstate.curr !== undefined && v < schedstate.curr.vrt) {
      tw.vrtlwk = {
        message: `(${v} < ${schedstate.curr.vrt}) OK`,
        color: "blue",
      };
      logger.debug(`HEII ${v} ---- ${schedstate.curr.vrt}`);
      removeFromRbt(schedstate.curr);
      addToRbt(schedstate.curr);
      resched(`Waking up task ${tw.name} @${timer.walltime}`);
    } else {
      if (schedstate.curr === undefined)
        resched(`Waking up task ${tw.name} @${timer.walltime}`);
      else {
        tw.vrtlwk = {
          message: `(${v} < ${schedstate.curr.vrt}) X`,
          color: "red",
        };
      }
    }
  };

  let _setTimeout = (func, ms: number, arg, type) => {
    timer.events.push({ deadline: ms + timer.walltime, func, arg, type });
  };

  let _task_tick = () => {
    _setTimeout(_task_tick, taskstates.timer, undefined, "_task_tick");
    if (schedstate.curr !== undefined) {
      let delta = taskstates.timer;

      if (schedstate.curr.events[0] >= delta) {
        schedstate.curr.sum = r2(schedstate.curr.sum + delta);
        schedstate.curr.vrt = r2(
          schedstate.curr.vrt + delta / schedstate.curr.lambda
        );
        schedstate.vmin = _.defaultTo(_.minBy(schedstate.rbt, "vrt"), {
          vrt: 0,
        }).vrt;
        schedstate.curr.events[0] = r2(schedstate.curr.events[0] - delta);
        if (
          schedstate.curr.sum - schedstate.curr.prev ==
            schedslice(schedstate.curr) &&
          schedstate.curr.events[0] > 0
        ) {
          removeFromRbt(schedstate.curr);
          addToRbt(schedstate.curr);
          resched(
            `task ${schedstate.curr.name} finished quantum @${timer.walltime}`
          );
        }
      }
      if (schedstate.curr.events[0] === 0) {
        // must sleep
        let ts = schedstate.curr;
        removeFromRbt(schedstate.curr);
        addBlocked(schedstate.curr);
        let blocktime = ts.events[1];
        if (!_.isUndefined(blocktime)) {
          _setTimeout(_wakeup, blocktime, ts, "_wakeup");
          ts.events = _.tail(_.tail(ts.events));
        } else {
          let v = _.find(
            taskstates.tasks,
            (t) => t.index === (schedstate.curr ? schedstate.curr.index : 0)
          );
          if (v) {
            v.exited = timer.walltime;
          }

          let vp = _.find(
            schedstate.origplan.tasks,
            (t) => t.index === (schedstate.curr ? schedstate.curr.index : 0)
          );
          if (vp) {
            vp.exited = timer.walltime;
          }
        }
        resched(`putting task to sleep ${ts.name} @${timer.walltime}`);
      }
    }
  };

  _.map(taskstates.tasks, (t) => {
    _setTimeout(_start_task, t.start, t, "_start_task");
  });
  _setTimeout(_task_tick, 2 * taskstates.timer, undefined, "_task_tick");

  let rawSchedule = _.map(
    _.range(1, taskstates.runfor / taskstates.timer + 2),
    updateTimer
  );

  return {
    rawSimData: rawSchedule, // <- this is the one being tested by jest
    simData: serialiseSim(rawSchedule, taskstates), // this is the serialised format
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
  cfsStateSnapshots: CFSTaskStateSnapshot[],
  cfsPlan: CFSStateTaskInfo
): Schedule => {
  // assume we always start from 0

  let getCFSTaskSlot = (
    tindex: number,
    curtime: number
  ): Maybe<CFSTaskSlot> => {
    let { rbt, blocked } = _.defaultTo(
      _.find(cfsStateSnapshots, ({ time }) => {
        return time === curtime;
      }),
      { rbt: [], blocked: [] }
    );
    let findRunning = () => _.find(rbt, (t) => t.R === "X");
    let tr = findRunning();
    if (tr) {
      if (rbt.length > 0 && tr.index === tindex) {
        return {
          event: "RAN",
          tstart: curtime,
          tend: curtime + cfsPlan.timer,
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
        let tt: CFSTaskState | undefined;
        if (!_.isUndefined((tt = _.find(rbt, (t) => t.index === tindex)))) {
          return {
            event: "RUNNABLE",
            tstart: curtime,
            tend: curtime + cfsPlan.timer,
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
            if (_.isUndefined(tt.exited) || curtime < tt.exited) {
              return {
                event: "BLOCKED",
                tstart: curtime,
                tend: curtime + cfsPlan.timer,
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
                tstart: curtime,
                tend: curtime + cfsPlan.timer,
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

let produceSchedule: ScheduleProducer;
produceSchedule = function (
  options: any,
  plan: Plan<any, any>,
  logger: Logger
) {
  return eventLoop(options, plan as CFSPlan, logger).simData;
};

export { eventLoop, produceSchedule, CFSPlan };
