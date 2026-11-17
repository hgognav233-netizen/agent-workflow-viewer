# Changelog

## 0.4.0

One interface instead of three: the canvas is now the only view. The conversation panel and the browser link show the same canvas.

- **Session list matches the Harness sidebar.** Grouped by workspace, pinned sessions first, then by latest activity, with the sidebar's own titles. Subagent and blank sessions are left out; archived sessions can be shown from the bottom of the list. The list is no longer cut at 40 sessions.
- **Language and colours follow Harness.** Inside Harness the canvas uses the Harness language setting and switches as soon as it changes, and takes the Harness colour scheme, accent colour, and font. A browser link carries the language it was opened in; on its own page the canvas keeps its colour-scheme button.
- **Conversation panel** (◇ Workflow) now shows the canvas focused on the current session, with its child tasks, instead of the earlier dot graph. **⤢** fills the window and **×** or Esc closes it.
- **Detail panel** has an **Overview** and a **Timeline** tab. The timeline lists messages, reasoning, tool calls with their results, and turn boundaries, with All / Tools / Thinking / Failures filters and paging. Every "open record" link lands there, in Harness and in the browser alike.
- **Browser link** from DSH Desktop shows the same information as the canvas inside Harness, including object names, error text, and the timeline. It is still loopback-only and expires after two hours.
- **Cards** show the full session title in their header. Running paths use the accent colour and failures are red. Coordination calls such as `subagent` or `wait_agent` read as actions ("Start child task"), and MCP tools as "MCP · server".
- **Removed:** the standalone board (`/agent-workflow/board`, `/agent-workflow/board-data`) and the separate header bar above the canvas page. `/agent-workflow/view?root=…` now opens the canvas focused on that session.
- Fixes the canvas opening at 1% zoom with nothing visible. The first fit waits until the viewport has a usable size, and the canvas fits again on resize until you move the camera yourself.
- Number, date, and currency formats follow the interface language. The colour scheme is stored under one key, `awv.theme`; a choice saved under the earlier key is kept.

## 0.3.0

- Adds an application-level page: a workflow icon in the left panel list, after Plugins, opens a canvas that is not bound to the open conversation.
- Drag sessions onto a shared canvas to inspect their live monochrome capability maps. Filter to active or failed paths, inspect tool evidence, or open the estimated spend view to inspect expensive model requests.
- Selected sessions automatically bring their delegated tasks into the canvas as expandable branches.
- Adds `/agent-workflow/canvas` and `/agent-workflow/canvas-data`, both behind Harness admission. The canvas keeps its selection in the browser, so reopening restores it.
- Opens the selected workflows in the system browser on DSH Desktop. The session picker discovers new sessions live, live updates preserve the visible graph and labels, and estimated costs can be displayed in USD or CNY.

- Reasoning blocks from the model log become their own timeline entries, with a Thinking filter. The conversation panel and the board both show them.
- Estimated spend: a total, the most expensive steps, and a per-capability attribution from prompt growth. Prices are the public DeepSeek list with peak and off-peak rates; models without a known price report no number instead of a guess.
- Subagents show the label they were dispatched with, their call count, and their estimated spend.
- Crowded capability maps grow taller so object names stay visible, and the board draws object names too.
- The conversation panel has the same colour-scheme button as the board, remembered per browser.

- The board opened from DSH Web now mirrors the conversation panel: overview, timeline with failure filtering and paging, session selector, object detail cards, and zoom/pan. The DSH Desktop browser board keeps its reduced summary.
- The board has a colour-scheme button — follow the system, force light, or force dark — remembered per browser.
- Selecting an object in the board and opening it in the timeline scrolls to that row and highlights it.

- DSH Desktop can open a session-scoped live summary in the system browser for split-screen use.

- Serves a standalone board at `/agent-workflow/view` for a detached window or a second screen.
- Reports working subagents on the root view and marks running sessions in the session selector.
- Shows the working phase — thinking, or the tool that is running — with a locally ticking clock and a pulse on the model node, so a model request no longer looks like a stall.
- Redesigned the capability map with monochrome nodes and flowing active paths. Selecting an object opens an anchored detail card with links to the timeline.
- Object dots stack in a vertical column that fits the plot, instead of overlapping when one capability holds many objects.

- Reworked the overview around active calls, failures, token usage, and a color-coded capability map.
- Added a session selector, failure filtering, timeline pagination, and links from objects to their exact events.
- Fixed duplicate counts when sessions move to disk and stale running states after interruption. File targets now retain their identity when tool arguments contain long content.
- Bounded the graph payload, reused unchanged responses, and paused polling in hidden tabs.
- Removed the diagnostic session-list route and requested Harness admission on the remaining routes.
- Added English and Simplified Chinese documentation, regression tests, and a GitHub Actions workflow.

## 0.1.0

Initial plugin with a zoomable capability map and a recent-activity timeline. [Published bundle source](https://github.com/hgognav233-netizen/agent-workflow-viewer/tree/677a39b6f1f0742c2fbc20b5ef45e63a0e196ffd)
