import _ from "lodash";
import { eventLoop, CFSPlan } from "./lib";
import { plans } from "./fixtures";
import { expect, it } from "@jest/globals";

const logger = {
  debug: () => {},
};

_.map(plans, (s, i) => {
  it(`Schedule ${i} works as expected`, () => {
    const res = eventLoop({}, s, logger);
    expect(res.rawSimData).toMatchSnapshot();
  });
});
