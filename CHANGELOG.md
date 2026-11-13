# Changelog

## Unreleased

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
