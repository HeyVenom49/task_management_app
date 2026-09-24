import { afterEach } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/" });

const { cleanup } = await import("@testing-library/react");
const matchers = await import("@testing-library/jest-dom/matchers");
const { expect } = await import("bun:test");

expect.extend(matchers);
afterEach(cleanup);
