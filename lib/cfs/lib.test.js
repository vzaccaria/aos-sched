const _ = require("lodash");
const { eventLoop } = require("./lib");
const { schedule } = require("./fixtures");

const logger = {
  debug: () => {},
};

_.map(schedule, (s, i) => {
  it(`Schedule ${i} works as expected`, () => {
    const res = eventLoop({}, s, logger);
    expect(res.rawSimData).toMatchSnapshot();
  });
});
