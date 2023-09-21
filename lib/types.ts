import { Logger } from "Winston";
type Maybe<T> = T | undefined;

type TaskSlot = {
  tstart: number;
  event: string;
  tend: number;
  index: number;
  belowSlot: string;
  inSlot: string;
  aboveSlot: {
    message: string;
    color: string;
  };
};

type Plan<T, C> = {
  timer: number;
  runfor: number;
  graphics: any;
  tasks: T[];
  class: C;
};

type Task = {
  index: number;
  name: string;
  start: number;
  events: number[];
  exited?: number;
};

type NoClass = {};

type ScheduledTask = Task & {
  description: string[]; // actually, only the first two are printed.
};

type Options = { blank: Boolean };

type Schedule = {
  scheddata: {
    legendAbove: string;
    blankData: string;
  };
  plan: Plan<ScheduledTask, NoClass>;
  timeline: TaskSlot[];
};

interface ScheduleProducer {
  (options: any, plan: Plan<any, any>, logger: Logger): Schedule;
}

export {
  Schedule,
  ScheduleProducer,
  Plan,
  TaskSlot,
  Options,
  Task,
  ScheduledTask,
  NoClass,
  Maybe,
};
