import { describe, expect, it } from "vitest";

import { symlink, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  buildUrl,
  getUploadMimeType,
  isCliEntrypoint,
  parseArgs
} from "./index.js";

describe("ulogo cli contract", () => {
  it("parses agent-friendly global flags", () => {
    const parsed = parseArgs([
      "clean",
      "./draft.png",
      "--json",
      "--wait",
      "--output",
      "./brand",
      "--idempotency-key",
      "job-123"
    ]);

    expect(parsed.command).toBe("clean");
    expect(parsed.args).toEqual(["./draft.png"]);
    expect(parsed.options.json).toBe(true);
    expect(parsed.options.wait).toBe(true);
    expect(parsed.options.output).toBe("./brand");
    expect(parsed.options.idempotencyKey).toBe("job-123");
  });

  it("builds API URLs from an override base URL", () => {
    expect(buildUrl("http://localhost:3000", "/api/v1/projects")).toBe(
      "http://localhost:3000/api/v1/projects"
    );
  });

  it("sets upload MIME types from supported logo extensions", () => {
    expect(getUploadMimeType("draft.svg")).toBe("image/svg+xml");
    expect(getUploadMimeType("draft.PNG")).toBe("image/png");
    expect(getUploadMimeType("draft.jpeg")).toBe("image/jpeg");
    expect(getUploadMimeType("draft.webp")).toBe("image/webp");
  });

  it("detects npm bin symlink entrypoints", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ulogo-cli-"));
    const target = join(directory, "dist-index.js");
    const linkedBin = join(directory, "ulogo");

    try {
      await writeFile(target, "#!/usr/bin/env node\n");
      await symlink(target, linkedBin);

      expect(isCliEntrypoint(linkedBin, pathToFileURL(resolve(target)).href)).toBe(
        true
      );
    } finally {
      await rm(directory, {
        force: true,
        recursive: true
      });
    }
  });
});
