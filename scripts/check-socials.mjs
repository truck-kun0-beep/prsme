import { connect } from "./cdp.mjs";
const HOST = process.env.PRSME_HOST ?? "http://127.0.0.1:3000";
const { goto, setViewport, evalJs, close } = await connect();

await setViewport(1280, 900);
await goto(`${HOST}/u/noir`, { waitMs: 3000 });
const r = await evalJs(`
  return {
    socialAnchors: document.querySelectorAll('[data-testid="profile-socials"] a').length,
    defaultHidden: !!document.querySelector('[data-default-profile]'),
    defaultDisplay: getComputedStyle(document.querySelector('[data-default-profile]') || document.body).display,
    overrideActive: document.body.dataset.profileOverride || null,
    defaultProfileVisuallyHidden: (() => {
      const el = document.querySelector('[data-default-profile]');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return cs.display === 'none' || cs.visibility === 'hidden';
    })(),
  };
`);
console.log(JSON.stringify(r, null, 2));
await close();