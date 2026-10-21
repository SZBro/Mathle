// Visitor counting with GoatCounter (no cookies). Page views are counted by its script;
// track() adds named events such as "played". Does nothing until the code is set.

// The site code from https://<code>.goatcounter.com
const GOATCOUNTER_CODE = 'szbro';

export function initAnalytics() {
  if (!GOATCOUNTER_CODE) return;
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://gc.zgo.at/count.js';
  s.dataset.goatcounter = `https://${GOATCOUNTER_CODE}.goatcounter.com/count`;
  document.head.append(s);
}

// Counts an event. GoatCounter itself skips localhost, so dev runs aren't counted.
export function track(name) {
  window.goatcounter?.count?.({ path: name, title: name, event: true });
}
