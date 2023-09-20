import _ from "lodash";
import { eventLoop } from "./lib";
import { schedule } from "./fixtures";

const logger = {
  debug: () => {},
};

_.map(schedule, (s, i) => {
  it(`Schedule ${i} works as expected`, () => {
    const res = eventLoop({}, s, logger);
    expect(res.rawSimData).toMatchSnapshot();
  });
});
