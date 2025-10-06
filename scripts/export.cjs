#!/usr/bin/env node
const path = require("path");
const exportApp = require("next/dist/export").default;
const { trace } = require("next/dist/trace");

(async () => {
  const projectDir = process.cwd();
  const span = trace("static-export");
  try {
    await exportApp(
      projectDir,
      {
        outdir: path.join(projectDir, "out"),
        enabledDirectories: { app: true, pages: false },
        silent: false,
        buildExport: true,
        numWorkers: 1,
      },
      span,
    );
    console.log("Static export complete: output in ./out");
  } catch (error) {
    console.error("Static export failed:", error);
    process.exit(1);
  } finally {
    if (typeof span.stop === "function") {
      span.stop();
    }
  }
})();
