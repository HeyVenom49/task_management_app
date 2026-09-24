import { afterEach } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * This project lives on an external/network volume that periodically
 * generates macOS AppleDouble sidecar files (e.g. "._LoginPage.test.tsx")
 * alongside real files. Bun's test-file discovery glob matches these too
 * (they still end in ".test.tsx"), and Bun tries to parse the binary
 * AppleDouble content as source, throwing a parse error and breaking the
 * whole suite. Delete any such stray files under src/ and test/ before
 * Bun's test runner scans for test files.
 */
function deleteAppleDoubleFiles(rootDir: string): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      deleteAppleDoubleFiles(fullPath);
      continue;
    }

    if (entry.isFile() && entry.name.startsWith("._")) {
      try {
        fs.unlinkSync(fullPath);
      } catch {
        // Best-effort cleanup; ignore failures (e.g. already removed).
      }
    }
  }
}

for (const dir of ["src", "test"]) {
  deleteAppleDoubleFiles(path.join(process.cwd(), dir));
}

GlobalRegistrator.register({ url: "http://localhost/" });

const { cleanup } = await import("@testing-library/react");
const matchers = await import("@testing-library/jest-dom/matchers");
const { expect } = await import("bun:test");

expect.extend(matchers);
afterEach(cleanup);
