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

  /**
   * Pre-seed localStorage on every subsequent navigation by attaching an
   * on-new-document script. The seed runs synchronously, before the page's
   * own React mount, so a downstream `Page.navigate` always boots with the
   * desired draft. Pass a non-JSON value to clear the previous seed.
   *
   * REPLACING, not accumulating. `Page.addScriptToEvaluateOnNewDocument` has no
   * "replace" — every call adds another script that runs on every subsequent
   * navigation, in the order it was added. Seeding four times therefore left
   * four scripts competing to write the same key, and a stale draft from an
   * earlier call could win and silently defeat the newest one. We now track the
   * id of the script we added and remove it first, so the most recent `seed()`
   * is always the only one in effect.
   */
let seedScriptId = null;

  /**
   * Pre-seed localStorage on every subsequent navigation by attaching an
   * on-new-document script. The seed runs synchronously, before the page's
   * own React mount, so a downstream `Page.navigate` always boots with the
   * desired draft.
   *
   * REPLACING, not accumulating. `Page.addScriptToEvaluateOnNewDocument` has no
   * "replace" — every call adds another script that runs on every subsequent
   * navigation, in the order it was added. Seeding four times therefore left
   * four scripts competing to write the same key, and a stale draft from an
   * earlier call could win and silently defeat the newest one. We now track the
   * id of the script we added and remove it first, so the most recent `seed()`
   * is always the only one in effect.
   *
   * Phase 4.6 — `seed(undefined)` REMOVES the injection entirely and writes
   * nothing on later navigations. This is a third distinct mode, and the one a
   * suite needs when it wants to exercise the app's real save/load cycle:
   *
   *   - `seed(obj)` re-writes the key on every navigation, which fights any real
   *     save the suite makes: the seed's data wins on the next load and the
   *     assertions end up describing the fixture instead of the application.
   *   - `seed(null)` clears the key on every navigation, which destroys the very
   *     save that was just committed.
   *   - `seed(undefined)` disarms the injection so the page runs on whatever is
   *     genuinely in localStorage.
   */
  async function seed(draftObj) {
    if (seedScriptId !== null) {
      try {
        await call("Page.removeScriptToEvaluateOnNewDocument", { identifier: seedScriptId });
      } catch {
        /* the page may already be gone; not fatal */
      }
      seedScriptId = null;
    }

    // `undefined` means "stop injecting", not "write an empty draft".
    if (draftObj === undefined) return;

    const expr = draftObj
      ? `try { localStorage.setItem('prsme:profile-draft:v1', ${JSON.stringify(JSON.stringify(draftObj))}); } catch (e) {}`
      : `try { localStorage.removeItem('prsme:profile-draft:v1'); } catch (e) {}`;
    const res = await call("Page.addScriptToEvaluateOnNewDocument", {
      source: expr,
      runImmediately: true,
    });
    seedScriptId = res.identifier ?? null;
  }

  async function goto(url, { waitMs = 3000 } = {}) {
    await call("Page.navigate", { url });
    await new Promise((r) => setTimeout(r, waitMs));
  }

  /**
   * Evaluate code in the page.
   *
   * The body is always injected as the body of an **async** function, and the
   * result is awaited, so a probe may use `await fetch(...)` and the resolved
   * value is what comes back. Two calling conventions are therefore both
   * supported and behave identically:
   *
   *   await evalJs(`const r = await fetch(...); return r.status;`)
   *   await evalJs(`return { n: document.querySelectorAll(...).length };`)
   *
   * A nested `(() => { ... return x })()` is *not* a supported way to produce a
   * value: the outer async function discards it and yields `undefined`. Write a
   * top-level `return ...;` instead.
   *
   * Pass `{ silent: true }` to swallow thrown errors and return null.
   *
   * Pass `{ once: true }` for any expression that MUTATES page state (a click,
   * a form dispatch, a localStorage write). When a body legitimately yields
   * `undefined` this shim otherwise retries once, on the theory that the first
   * round-trip was lost to a navigation. For a mutation that retry silently
   * performs the action *twice* — which is how a "move this row down" click
   * ends up moving it down and straight back up. `once` disables the retry.
   */
  async function evalJs(code, maybeOptions) {
    const opts = (typeof maybeOptions === "object" && maybeOptions) || {};
    const silent = opts.silent === true;
    const once = opts.once === true;
    const body = String(code);

    async function run() {
      try {
        const res = await call("Runtime.evaluate", {
          expression: `(async () => { ${body} })()`,
          awaitPromise: true,
          returnByValue: true,
        });
        if (res.exceptionDetails) {
          return {
            ok: false,
            err:
              res.exceptionDetails.exception?.description ??
              res.exceptionDetails.text ??
              "eval error",
          };
        }
        return { ok: true, value: res.result?.value };
      } catch (err) {
        return { ok: false, err: String((err && err.message) || err) };
      }
    }

    let first = await run();
    if (!once && first.ok && first.value === undefined) {
      // Lost first round-trip after navigation; retry once.
      await new Promise((r) => setTimeout(r, 80));
      first = await run();
    }
    if (!first.ok) {
      if (silent) return null;
      throw new Error(first.err);
    }
    return first.value;
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

  return { call, goto, setViewport, seed, evalJs, screenshot, consoleErrors, close };
}