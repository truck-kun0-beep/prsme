/**
 * Shared CDP driver for Phase 3.1 verification.
 *
 * Speaks the Chromium DevTools Protocol over Node's global WebSocket
 * (Node 22+). No test framework, no puppeteer dependency.
 */

export const CDP_PORT = Number(process.env.PRSME_CDP_PORT ?? 9334);

export async function connect() {
  const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
  const page = list.find((t) => t.type === "page");
  if (!page) throw new Error("No page target on CDP endpoint");

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res);
    ws.addEventListener("error", rej);
  });

  let nextId = 1;
  const pending = new Map();
  const consoleErrors = [];

  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
      return;
    }
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
      consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
    }
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      consoleErrors.push(d.exception?.description ?? d.text);
    }
  });

  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  await call("Page.enable");
  await call("Runtime.enable");

  /** Set the emulated viewport (affects CSS media queries). */
  async function setViewport(width, height = 900) {
    await call("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }

  async function goto(url, { waitMs = 3000 } = {}) {
    await call("Page.navigate", { url });
    await new Promise((r) => setTimeout(r, waitMs));
  }

  /**
   * Evaluate code in the page.
   *
   * The input is always injected verbatim as the body of an async function, so
   * callers use an explicit `return value;`. Pass `{ expr: true }` as the
   * second argument to have a bare expression returned for you.
   */
  async function evalJs(code, maybeOptions) {
    const raw = String(code);
    const isExpr =
      typeof maybeOptions === "object" &&
      maybeOptions !== null &&
      maybeOptions.expr === true;
    const finalBody = isExpr ? `return (${raw.trim()});` : raw;

    const res = await call("Runtime.evaluate", {
      expression: `(async () => { ${finalBody} })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      throw new Error(
        res.exceptionDetails.exception?.description ??
          res.exceptionDetails.text ??
          "eval error",
      );
    }
    return res.result.value;
  }

  /** Capture a screenshot to a file. */
  async function screenshot(path, { fullPage = false } = {}) {
    const params = { format: "png", captureBeyondViewport: fullPage };
    if (fullPage) {
      const metrics = await call("Page.getLayoutMetrics");
      const w = Math.ceil(metrics.cssContentSize.width);
      const h = Math.min(Math.ceil(metrics.cssContentSize.height), 16000);
      params.clip = { x: 0, y: 0, width: w, height: h, scale: 1 };
    }
    const shot = await call("Page.captureScreenshot", params);
    const { writeFileSync } = await import("node:fs");
    writeFileSync(path, Buffer.from(shot.data, "base64"));
    return path;
  }

  async function close() {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  }

  return { call, goto, setViewport, evalJs, screenshot, consoleErrors, close };
}