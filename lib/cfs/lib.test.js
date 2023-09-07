const _ = require("lodash");
const { eventLoop } = require("./lib");
const { schedule } = require("./fixtures");

const logger = {
  debug: () => {},
};

_.map(schedule, (s, i) => {
  it(`Schedule ${i} works as expected`, () => {
    console.log(s);
    const res = eventLoop({}, s, logger);
    expect(res.nonAnnotatedHistory).toMatchSnapshot();
  });
});
