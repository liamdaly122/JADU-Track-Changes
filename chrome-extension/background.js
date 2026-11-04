// Leeds CMS page grabber
// - toolbar button: injects the grabber pane into the current tab
// - "deliver" messages from the pane: hands the grabbed HTML to an open CMS tab (file:// or http://localhost),
//   so no local server is needed. The CMS tab is found by its title. Hosted copies on *.vercel.app work too
//   (add your own domain to host_permissions in manifest.json if you give the site one).

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !/^https?:/.test(tab.url || '')) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['grabber.js'] });
  } catch (e) {
    console.error('Leeds CMS grabber could not run on this page:', e);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'deliver') {
    deliver(msg.payload).then(sendResponse, (e) => sendResponse({ ok: false, reason: e.message }));
    return true; // async response
  }
});

async function findCmsTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs.filter((t) => /^Leeds prototyping CMS/.test(t.title || '') || /leeds-cms\/(index\.html)?([#?]|$)/.test(t.url || ''));
}

async function deliver(payload) {
  const tabs = await findCmsTabs();
  if (!tabs.length) return { ok: false, reason: 'no CMS tab is open (open index.html first)' };
  const tab = tabs[0];
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (p) => { window.postMessage(p, '*'); },
      args: [payload]
    });
    try { await chrome.tabs.update(tab.id, { active: true }); await chrome.windows.update(tab.windowId, { focused: true }); } catch (e) { /* focusing is optional */ }
    return { ok: true };
  } catch (e) {
    const fileHint = /^file:/.test(tab.url || '') ? ' For a CMS opened from a file, enable "Allow access to file URLs" for this extension on chrome://extensions.' : '';
    return { ok: false, reason: e.message + fileHint };
  }
}
