import assert from "node:assert/strict";
import test from "node:test";

const applicationDocument =
  /<!DOCTYPE html>[\s\S]*<html(?:\s|>)[\s\S]*<head(?:\s|>)[\s\S]*<title>[^<]*三江集团智能问答与智能办公系统[^<]*<\/title>[\s\S]*<body(?:\s|>)/i;

test("renders the application HTML document", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(html, applicationDocument);
  assert.doesNotMatch(html, /Application error|Internal Server Error/i);
});
