# Phase 1A Browser E2E Acceptance Report

Generated: 2026-05-21T02:37:53.821Z

## Build Under Test

- Repository commit: `c2a3a04`
- Extension manifest: present
- Extension id from smoke: unknown
- Chrome path: `C:\Program Files\Google\Chrome\Application\chrome.exe`
- Browser version: Chrome/148.0.7778.168
- Permissions: storage, tabs, scripting, activeTab, offscreen, alarms, contextMenus, unlimitedStorage
- Commands: open_rail, command_palette, save_page
- SQLite WASM asset: see build output assets

## Automated Browser Smoke

- Command: `node poc/chrome-extension-smoke.mjs`
- Exit status: 1
- Duration: 11317 ms
- Classified status: blocked

```json
{
  "status": "blocked",
  "error": "Chrome rejected command-line unpacked extension loading; use Chrome for Testing, Chromium, or a headed manual load.",
  "extensionLoad": {
    "expected": {
      "name": "Clio",
      "version": "0.0.1",
      "serviceWorker": "background.js"
    },
    "extensionTargets": [
      {
        "type": "service_worker",
        "url": "chrome-extension://fignfifoniblkonapihmkfakmlgkbkcf/service_worker.js",
        "title": "Service Worker chrome-extension://fignfifoniblkonapihmkfakmlgkbkcf/service_worker.js",
        "runtime": {
          "runtimeId": "fignfifoniblkonapihmkfakmlgkbkcf",
          "href": "chrome-extension://fignfifoniblkonapihmkfakmlgkbkcf/service_worker.js",
          "manifest": {
            "manifest_version": 3,
            "name": "Google Network Speech",
            "version": "1.0",
            "background": {
              "service_worker": "service_worker.js"
            },
            "permissions": [
              "metricsPrivate",
              "offscreen",
              "systemPrivate",
              "ttsEngine"
            ],
            "host_permissions": [
              "https://www.google.com/"
            ]
          }
        }
      }
    ],
    "extensionLoadLog": [
      "[23620:23064:0521/103754.003:WARNING:chrome\\browser\\extensions\\extension_service.cc:440] --disable-extensions-except is not allowed in Google Chrome, ignoring."
    ]
  }
}
```

## Phase 1A Product Scenarios

| # | Scenario | Automated status | Automation evidence | Headed/manual fallback |
|---:|---|---|---|---|
| 1 | Open a normal page, select text, and see the Clio selection mini UI. | blocked | Chrome rejected command-line unpacked extension loading; use Chrome for Testing, Chromium, or a headed manual load. | Open any http/https article page, select a paragraph, and confirm the mini UI shows Save, Search, and Open Toolbox icon buttons near the selection. |
| 2 | Save selection; Toolbox/Rail opens and Library shows the selection memory. | blocked | Chrome rejected command-line unpacked extension loading; use Chrome for Testing, Chromium, or a headed manual load. | Click the mini UI Save button and confirm the in-page Rail opens with the saved selection visible in Library. |
| 3 | Save current page; Toolbox/Rail opens and Library shows the page memory. | blocked | Chrome rejected command-line unpacked extension loading; use Chrome for Testing, Chromium, or a headed manual load. | Click Save current page from the Rail on a readable page and confirm a page memory appears. On low-confidence pages, confirm Clio asks for selected passage instead. |
| 4 | Keyword search finds saved selection and saved page. | blocked | Chrome rejected command-line unpacked extension loading; use Chrome for Testing, Chromium, or a headed manual load. | Search for a unique term from the saved selection and page, and confirm both result types can be found. |
| 5 | Detail view opens and back returns to list. | blocked | Chrome rejected command-line unpacked extension loading; use Chrome for Testing, Chromium, or a headed manual load. | Open a Library item, confirm detail replaces the list, then click Back and confirm the list returns. |
| 6 | Delete with confirmation; deleted memory disappears from list/search. | blocked | Chrome rejected command-line unpacked extension loading; use Chrome for Testing, Chromium, or a headed manual load. | Open a memory detail, click Delete, accept confirmation, and confirm the item no longer appears in list or search. |
| 7 | Refresh/restart extension or browser context; memories persist. | blocked | Chrome rejected command-line unpacked extension loading; use Chrome for Testing, Chromium, or a headed manual load. | Restart Chrome or reload the extension with the same profile, open the Rail again, and confirm previously saved memories remain searchable. |
| 8 | Simulate SQLite/OPFS degraded or error; Toolbox shows health and links Options Storage Health. | blocked | Chrome rejected command-line unpacked extension loading; use Chrome for Testing, Chromium, or a headed manual load. | Use the current browser smoke blocker or a forced storage startup failure, then confirm Toolbox/Popup expose a non-ready health state and Options Storage Health repair actions are reachable. |

## Manual Acceptance Steps

1. Run `pnpm build` from `Clio-browser/`.
2. Open Chrome and load `apps/extension/.output/chrome-mv3` as an unpacked extension.
3. Open a normal `http://` or `https://` article page.
4. Execute each scenario in the table above.
5. Replace each scenario status in this report with `pass`, `fail`, or `blocked`, and record exact observations.

## Current Conclusion

The local automated path records browser-environment evidence, but product E2E scenarios are not yet marked as passed until a headed/manual run or a stronger browser automation harness completes them.
