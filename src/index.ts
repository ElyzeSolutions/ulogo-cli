#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

type CliOptions = {
  apiKey: string | undefined;
  baseUrl: string;
  idempotencyKey: string | undefined;
  json: boolean;
  output: string | undefined;
  wait: boolean;
};

type ParsedCommand = {
  args: string[];
  command: string | undefined;
  options: CliOptions;
};

const defaultBaseUrl = "https://ulogo.it";
const pollDelayMs = 2_000;
const maxPollAttempts = 180;

export function parseArgs(argv: string[]): ParsedCommand {
  const args: string[] = [];
  const options: CliOptions = {
    apiKey: process.env.ULOGO_API_KEY,
    baseUrl: process.env.ULOGO_BASE_URL ?? defaultBaseUrl,
    idempotencyKey: undefined,
    json: false,
    output: undefined,
    wait: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--json") {
      options.json = true;
      continue;
    }

    if (value === "--wait") {
      options.wait = true;
      continue;
    }

    if (value === "--api-key") {
      options.apiKey = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--base-url") {
      options.baseUrl = argv[index + 1] ?? defaultBaseUrl;
      index += 1;
      continue;
    }

    if (value === "--idempotency-key") {
      options.idempotencyKey = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--output") {
      options.output = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--url" || value === "--secret") {
      args.push(value);
      args.push(argv[index + 1] ?? "");
      index += 1;
      continue;
    }

    args.push(value ?? "");
  }

  return {
    args: args.slice(1),
    command: args[0],
    options
  };
}

function fail(message: string, json: boolean, code = 1): never {
  if (json) {
    process.stdout.write(`${JSON.stringify({ error: message })}\n`);
  } else {
    process.stderr.write(`${message}\n`);
  }

  process.exit(code);
  throw new Error(message);
}

function print(value: unknown, json: boolean) {
  if (json) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function readResponseJson(response: Response) {
  const text = await response.text();

  if (text.trim() === "") {
    return undefined;
  }

  const parsed: unknown = JSON.parse(text);

  return parsed;
}

function getObjectProperty(value: unknown, property: string) {
  if (!value || typeof value !== "object" || !(property in value)) {
    return undefined;
  }

  return Object.entries(value).find(([key]) => key === property)?.[1];
}

function getProblemDetail(payload: unknown, fallback: string) {
  const detail = getObjectProperty(payload, "detail");

  if (typeof detail === "string" && detail.trim() !== "") {
    return detail;
  }

  return fallback;
}

function requireApiKey(options: CliOptions) {
  if (!options.apiKey) {
    fail("Set ULOGO_API_KEY or pass --api-key.", options.json, 2);
  }

  return options.apiKey;
}

export function buildUrl(baseUrl: string, path: string) {
  return new URL(path, baseUrl).toString();
}

export function getUploadMimeType(filePath: string) {
  const extension = extname(filePath).toLowerCase();

  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }

  if (extension === ".png") {
    return "image/png";
  }

  if (extension === ".svg") {
    return "image/svg+xml";
  }

  if (extension === ".webp") {
    return "image/webp";
  }

  return "application/octet-stream";
}

export function isCliEntrypoint(argvPath: string | undefined, moduleUrl: string) {
  if (!argvPath) {
    return false;
  }

  try {
    return realpathSync(argvPath) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

async function requestJson(input: {
  body?: unknown;
  method?: string;
  options: CliOptions;
  path: string;
}) {
  const headers = new Headers({
    authorization: `Bearer ${requireApiKey(input.options)}`
  });

  if (input.options.idempotencyKey) {
    headers.set("idempotency-key", input.options.idempotencyKey);
  }

  let body: BodyInit | undefined;

  if (input.body) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(input.body);
  }

  const requestInit = body
    ? {
        body,
        headers,
        method: input.method ?? "GET"
      }
    : {
        headers,
        method: input.method ?? "GET"
      };
  const response = await fetch(
    buildUrl(input.options.baseUrl, input.path),
    requestInit
  );
  const payload = await readResponseJson(response).catch(() => undefined);

  if (!response.ok) {
    fail(
      getProblemDetail(payload, `Request failed with ${response.status}.`),
      input.options.json
    );
  }

  return payload;
}

async function clean(filePath: string | undefined, options: CliOptions) {
  if (!filePath) {
    fail("Usage: ulogo clean <file> [--wait] [--output ./brand]", options.json);
  }

  const data = await readFile(filePath);
  const formData = new FormData();
  const blob = new Blob([data], {
    type: getUploadMimeType(filePath)
  });

  formData.set("file", blob, basename(filePath));

  const headers = new Headers({
    authorization: `Bearer ${requireApiKey(options)}`
  });

  if (options.idempotencyKey) {
    headers.set("idempotency-key", options.idempotencyKey);
  }

  const response = await fetch(buildUrl(options.baseUrl, "/api/v1/projects/clean"), {
    body: formData,
    headers,
    method: "POST"
  });
  const payload = await readResponseJson(response);

  if (!response.ok) {
    fail(
      getProblemDetail(payload, `Request failed with ${response.status}.`),
      options.json
    );
  }

  return maybeWaitAndDownload(payload, options);
}

async function maybeWaitAndDownload(payload: unknown, options: CliOptions) {
  if (!options.wait || !payload || typeof payload !== "object") {
    return payload;
  }

  const projectValue = getObjectProperty(payload, "project");

  if (!projectValue || typeof projectValue !== "object" || !("id" in projectValue)) {
    return payload;
  }

  const projectId = String(getObjectProperty(projectValue, "id"));
  const ready = await waitForReady(projectId, options);

  if (options.output) {
    await downloadProject(projectId, options);
  }

  return ready;
}

async function waitForReady(projectId: string, options: CliOptions) {
  for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
    const payload = await requestJson({
      options,
      path: `/api/v1/projects/${projectId}`
    });
    const projectValue = getObjectProperty(payload, "project");
    const status =
      getObjectProperty(projectValue, "status") !== undefined
        ? String(getObjectProperty(projectValue, "status"))
        : "unknown";

    if (status === "ready" || status === "reviewing" || status === "failed") {
      return payload;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, pollDelayMs);
    });
  }

  fail("Timed out waiting for the project to finish.", options.json);
}

async function downloadProject(projectId: string, options: CliOptions) {
  const output = options.output ?? ".";
  const assetsPayload = await requestJson({
    options,
    path: `/api/v1/projects/${projectId}/assets`
  });
  const assetsValue = getObjectProperty(assetsPayload, "assets");

  if (!Array.isArray(assetsValue)) {
    fail("API returned no assets.", options.json);
  }

  await mkdir(output, { recursive: true });

  for (const asset of assetsValue) {
    if (!asset || typeof asset !== "object") {
      continue;
    }

    const idValue = getObjectProperty(asset, "id");
    const filenameValue = getObjectProperty(asset, "filename");
    const id = idValue !== undefined ? String(idValue) : undefined;
    const filename =
      filenameValue !== undefined ? String(filenameValue) : undefined;

    if (!id || !filename) {
      continue;
    }

    const response = await fetch(
      buildUrl(options.baseUrl, `/api/v1/projects/${projectId}/assets/${id}/download`),
      {
        headers: {
          authorization: `Bearer ${requireApiKey(options)}`
        }
      }
    );

    if (!response.ok) {
      fail(`Could not download ${filename}.`, options.json);
    }

    const arrayBuffer = await response.arrayBuffer();
    await writeFile(join(output, filename), Buffer.from(arrayBuffer));
  }

  return {
    output,
    projectId
  };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const command = parsed.command;
  const options = parsed.options;

  if (!command || command === "help") {
    print(
      {
        commands: [
          "clean",
          "generate",
          "status",
          "download",
          "edit",
          "batch",
          "usage",
          "webhooks test"
        ]
      },
      options.json
    );
    return;
  }

  if (command === "clean") {
    print(await clean(parsed.args[0], options), options.json);
    return;
  }

  if (command === "generate") {
    const prompt = parsed.args.join(" ");

    if (!prompt) {
      fail("Usage: ulogo generate <prompt>", options.json);
    }

    print(
      await maybeWaitAndDownload(
        await requestJson({
          body: { prompt },
          method: "POST",
          options,
          path: "/api/v1/projects/generate"
        }),
        options
      ),
      options.json
    );
    return;
  }

  if (command === "status") {
    const projectId = parsed.args[0];

    if (!projectId) {
      fail("Usage: ulogo status <project-id>", options.json);
    }

    print(await requestJson({ options, path: `/api/v1/projects/${projectId}` }), options.json);
    return;
  }

  if (command === "download") {
    const projectId = parsed.args[0];

    if (!projectId) {
      fail("Usage: ulogo download <project-id> --output ./brand", options.json);
    }

    print(await downloadProject(projectId, options), options.json);
    return;
  }

  if (command === "edit") {
    const projectId = parsed.args[0];
    const prompt = parsed.args.slice(1).join(" ");

    if (!projectId || !prompt) {
      fail("Usage: ulogo edit <project-id> <prompt>", options.json);
    }

    print(
      await maybeWaitAndDownload(
        await requestJson({
          body: { prompt },
          method: "POST",
          options,
          path: `/api/v1/projects/${projectId}/edits`
        }),
        options
      ),
      options.json
    );
    return;
  }

  if (command === "batch") {
    const manifestPath = parsed.args[0];

    if (!manifestPath) {
      fail("Usage: ulogo batch <manifest.json>", options.json);
    }

    const manifest: unknown = JSON.parse(await readFile(manifestPath, "utf8"));

    print(
      await requestJson({
        body: manifest,
        method: "POST",
        options,
        path: "/api/v1/batches"
      }),
      options.json
    );
    return;
  }

  if (command === "usage") {
    print(await requestJson({ options, path: "/api/v1/projects" }), options.json);
    return;
  }

  if (command === "webhooks" && parsed.args[0] === "test") {
    const urlIndex = parsed.args.indexOf("--url");
    const secretIndex = parsed.args.indexOf("--secret");
    const url = urlIndex >= 0 ? parsed.args[urlIndex + 1] : undefined;
    const secret = secretIndex >= 0 ? parsed.args[secretIndex + 1] : undefined;

    if (!url || !secret) {
      fail(
        "Usage: ulogo webhooks test --url <https-url> --secret <whsec_...>",
        options.json
      );
    }

    print(
      await requestJson({
        body: {
          secret,
          url
        },
        method: "POST",
        options,
        path: "/api/v1/webhooks/test"
      }),
      options.json
    );
    return;
  }

  fail(`Unknown command: ${command}`, options.json, 2);
}

if (isCliEntrypoint(process.argv[1], import.meta.url)) {
  main().catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Unexpected CLI error.";

    fail(message, process.argv.includes("--json"));
  });
}
