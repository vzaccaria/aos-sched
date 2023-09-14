let _ = require("lodash");

let latexArtifact = (code, name, clss, engine, addoptions) => {
  let sfx = _.kebabCase(name);
  if (_.isUndefined(clss)) clss = "standalone";
  if (_.isUndefined(engine)) engine = "pdflatex";

  return {
    code,
    clss,
    name,
    sfx,
    engine,
    addoptions,
  };
};

let wrapper = (c) => `
\\begin{tikzpicture}
${c}
\\end{tikzpicture}
`;

let simToLatex = (sim, options, logger) => {
  let hs = sim.schedule.graphics.hspace;
  let vs = sim.schedule.graphics.vspace;
  let hh = sim.schedule.graphics.barheight;

  let printAt = (time, index, m) => {
    return `\\node at(${hs * time}, ${index * hs + 0.5 * hh}) {\\tiny ${m}};`;
  };

  let printAtConf = (time, index, m, conf) => {
    return `\\node [${conf}] at(${hs * time}, ${
      index * hs + 0.5 * hh
    }) {\\tiny ${m}};`;
  };

  let pAboveSlot = (r) =>
    !_.isUndefined(r.aboveSlot) && r.aboveSlot.message !== ""
      ? printAtConf(
          r.tend,
          r.index + 0.4,
          `${r.aboveSlot.message}`,
          `anchor=east, text=${r.aboveSlot.color}`
        )
      : "";

  let r2 = (x) => Math.round(x * 1000) / 1000;

  let drawRan = (r) => {
    return [
      `\\draw[draw=black] (${r.tstart * hs}, ${r.index * vs}) rectangle ++(${
        (r.tend - r.tstart) * hs
      },${hh}) node[pos=.5] {}; `,
      printAt(r.tend, r.index - 0.4, r.belowSlot),
      printAt(r.tend - 0.25, r.index, `${r.inSlot}`),
      pAboveSlot(r),
    ];
  };
  let drawBlocked = (r) => {
    return [
      `\\draw[draw=black, fill=gray] (${r.tstart * hs}, ${
        r.index * vs
      }) rectangle ++(${
        (r.tend - r.tstart) * hs
      },${hh}) node[pos=.5, text=white] {};`,
      pAboveSlot(r),
    ];
  };
  let drawRunnable = (r) => {
    return [pAboveSlot(r)];
  };
  let diag = _.map(sim.timeline, (x, i) => {
    if (x.tstart < sim.schedule.runfor) {
      if (x.event === "RAN") return drawRan(x);
      if (x.event === "BLOCKED") return drawBlocked(x);
      if (x.event === "RUNNABLE") return drawRunnable(x);
    }
    return [];
  });
  logger.debug(sim.schedule.tasks);
  let tnames = _.flattenDeep([
    _.map(
      sim.schedule.tasks,
      (t) => `\\node at(${hs * -1}, ${t.index * hs + 0.5 * hh}) {${t.name}};`
    ),
    _.map(sim.schedule.tasks, (t) => [
      printAt(-0.6, t.index - 0.4, t.legendBelowTask1),
      printAt(-0.6, t.index - 0.2, t.legendBelowTask2),
    ]),
  ]);
  let grid = [
    `\\draw[xstep=${sim.schedule.timer},gray!20,thin,shift={(0,-0.25)}] (0,0) grid (${sim.schedule.runfor},${sim.schedule.tasks.length});`,
    _.map(_.range(0, sim.schedule.runfor / sim.schedule.timer + 1), (i) =>
      printAtConf(
        i * sim.schedule.timer,
        -0.7,
        `\\emph{${i * sim.schedule.timer}}`,
        "text=gray"
      )
    ),
  ];
  logger.debug(sim.schedule.tasks);

  let taskevents = _.map(sim.schedule.tasks, (t) => {
    return [
      `\\draw [->] (${t.start}, ${t.index} + 0.75) -- (${t.start}, ${t.index});`,
    ];
  });

  let taskexits = _.map(sim.schedule.tasks, (t) => {
    return !_.isUndefined(t.exited)
      ? [
          `\\draw [<-] (${t.exited}, ${t.index} + 0.75) -- (${t.exited}, ${t.index});`,
        ]
      : [];
  });

  let data = [
    printAtConf(
      -0.6,
      sim.schedule.tasks.length,
      sim.scheddata.legendAbove,
      "anchor=west"
    ),
  ];
  if (_.isUndefined(options.blank) || !options.blank) {
    return wrapper(
      _.join(
        _.flattenDeep([grid, tnames, diag, taskevents, taskexits, data]),
        "\n"
      )
    );
  } else {
    return wrapper(
      _.join(_.flattenDeep([grid, tnames, taskevents, data]), "\n")
    );
  }
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

module.exports = {
  latexArtifact,
  saveArtifact,
  saveArtifacts,
  compileArtifact,
  compileArtifacts,
  simToLatex,
  exportLatex,
};
