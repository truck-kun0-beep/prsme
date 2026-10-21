import { connect } from "./cdp.mjs";
const HOST = process.env.PRSME_HOST ?? "http://127.0.0.1:3000";
const { goto, setViewport, evalJs, close } = await connect();
await setViewport(1280, 1100);
await goto(`${HOST}/studio`, { waitMs: 4500 });
// reset
await evalJs(`
  document.querySelector('[data-testid="studio-reset-btn"]')?.click();
  document.querySelector('[data-testid="studio-reset-confirm-btn"]')?.click();
`);
await new Promise(r => setTimeout(r, 900));
// soundtrack tab
await evalJs(`document.querySelector('[data-testid="studio-tab-soundtrack"]')?.click();`);
await new Promise(r => setTimeout(r, 700));

const probe = await evalJs(`
  return {
    inputPresent: !!document.querySelector('#f-st-url'),
    panelHidden: document.querySelector('[data-panel-id="soundtrack"]')?.hasAttribute('hidden'),
    value: document.querySelector('#f-st-url')?.value,
  };
`);
console.log("PROBE:", probe);

// Direct API call test
const api = await evalJs(`
  return (async () => {
    const r = await fetch('/api/spotify/oembed?url=' + encodeURIComponent('https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp'));
    return { status: r.status, body: await r.json() };
  })();
`);
console.log("API DIRECT:", JSON.stringify(api, null, 2));

// Now set the input
const set = await evalJs(`
  return (() => {
    const input = document.querySelector('#f-st-url');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return input.value;
  })();
`);
console.log("SET:", set);
await new Promise(r => setTimeout(r, 5000));

const after = await evalJs(`
  return {
    okIndicator: !!document.querySelector('[data-testid="studio-soundtrack-ok"]'),
    okText: document.querySelector('[data-testid="studio-soundtrack-ok"]')?.textContent,
    alerts: [...document.querySelectorAll('[role="alert"]')].map(a => a.textContent),
    draftSoundtrack: (() => {
      const el = document.querySelector('[data-panel-id="soundtrack"]');
      return el ? el.textContent.slice(0, 200) : null;
    })(),
  };
`);
console.log("AFTER:", JSON.stringify(after, null, 2));
await close();