import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

declare module "bun:test" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- required shape for TypeScript declaration merging with bun:test's Matchers<T>; a type alias cannot merge with an existing interface.
  interface Matchers<T> extends TestingLibraryMatchers<T, void> {}
}
