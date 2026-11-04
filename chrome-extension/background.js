// Leeds CMS page grabber
// - toolbar button: injects the grabber pane into the current tab
// - "deliver" messages from the pane: hands the grabbed HTML to an open CMS tab. The CMS tab is found by its title.
//   The online CMS (https://jadutrackchange.vercel.app/) is preferred when several CMS tabs are open; a local copy
//   (file:// or http://localhost) is used otherwise. If no CMS tab is open, the pane opens the online CMS itself.
//   If the site moves to its own domain, change CMS_HOME below, the address in grabber.js, and host_permissions.

const CMS_HOME = 'https://jadutrackchange.vercel.app/';

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
  const cms = tabs.filter((t) => (t.url || '').startsWith(CMS_HOME) || /^Leeds prototyping CMS/.test(t.title || '') || /leeds-cms\/(index\.html)?([#?]|$)/.test(t.url || ''));
  // online copy first, then the most recently used
  return cms.sort((a, b) => ((b.url || '').startsWith(CMS_HOME) - (a.url || '').startsWith(CMS_HOME)) || ((b.lastAccessed || 0) - (a.lastAccessed || 0)));
}

async function deliver(payload) {
  const tabs = await findCmsTabs();
  if (!tabs.length) return { ok: false, reason: 'no CMS tab is open' };
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
