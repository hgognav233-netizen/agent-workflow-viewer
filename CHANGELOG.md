# Changelog

## Unreleased

- Fixes the canvas opening at 1% zoom with nothing visible. The first fit now waits until the viewport has a usable size, and the canvas fits again when the viewport is resized, until you move the camera yourself.
- The canvas follows the browser language: Simplified Chinese when it is Chinese, English otherwise, including number, date, and currency formats.
- The board, the canvas, and the conversation panel use the same names for capabilities and zones. The board shows 网络 / 外部服务 instead of 云端 / 外部程序, and capability names instead of internal ids such as `web` or `shell`.
- The colour scheme is stored under one key, `awv.theme`, shared by the panel, the board, and the canvas. A choice saved under the earlier keys is kept.
- A collapsed child task on the canvas shows only its state and timer on a single line.

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
