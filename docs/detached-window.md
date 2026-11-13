# 独立窗口与分屏 · Detached windows and split screen

[简体中文](#简体中文) · [English](#english)

## 简体中文

### 怎么分屏

| 你想要的布局 | 做法 |
| --- | --- |
| 同一个实时会话的对话和看板各占半屏 | 在 **DSH Web** 中打开会话与插件，点「独立窗口」。浏览器允许弹窗时，看板会在第二个浏览器窗口里打开。两个窗口连接同一个 Web Host。 |
| DSH Desktop 看板和另一个软件各占半屏 | 点面板右上方的「⤢ 占满窗口」，再用 Windows 的 `Win + ← / →` 排列 DSH 和另一个应用。看板仍占用原来的 DSH 窗口。 |
| 保留 DSH Desktop 对话，同时把它的实时看板放到第二个窗口 | 在更新后的插件中点「浏览器看板」。它会用系统浏览器打开所选会话的实时摘要。若浏览器在已有窗口里打开标签页，可将该标签页拖成独立窗口再分屏。 |

[Windows 分屏说明](https://support.microsoft.com/en-gb/windows/experience/snap-your-windows)

### 为什么此前的尝试失败

1. **路由和窗口是两回事。** `/agent-workflow/view?root=…` 返回 200，只说明当前 HTTP 请求拿到了 HTML。还要验证窗口真的创建了，以及窗口里的 `/agent-workflow/map` 请求能拿到实时数据。启用 `noopener` 时，即使浏览器成功打开页面，`window.open()` 也可能返回 `null`。 [MDN：window.open](https://developer.mozilla.org/en-US/docs/Web/API/Window/open)
2. **桌面壳决定能不能建窗。** 在 Windows 安装包 `0.2.2-rc.3` 的 `app.asar/lib/main.js` 中，主窗口的 `setWindowOpenHandler` 始终拒绝创建子窗口，只把 HTTP(S) 地址交给系统浏览器。应用里的相对路径会解析为 `dsh-app://app/agent-workflow/view?…`，补全地址也仍然是桌面壳专用协议。画中画在这次尝试中同样没有打开，且它是置顶窗口，不适合作为普通分屏窗口。 [DSH Desktop 架构](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/README.md) · [画中画 API](https://developer.mozilla.org/en-US/docs/Web/API/Document_Picture-in-Picture_API)
3. **能打开浏览器还需要能访问同一个 Host。** Desktop 通过桌面壳把应用请求转发给自己的 Host，认证由宿主处理。复制桌面地址或另外运行 `dsh web` 不会把浏览器连到原来的实时会话。若要边聊边看，使用同一个 Web Host 的对话窗口与看板窗口。

排查面板内部的点击问题时，确认它挂在 `shell.overlay`，并且面板启用了 `pointer-events: auto`。SVG 拖动超过 5 px 后再捕获指针，给节点保留正常的点击事件。

### 浏览器看板的访问范围

看板连接正在运行的 Desktop Host，显示工作阶段、工具名和汇总计数。链接仅限本机和所选会话，两小时后或 Host 退出后失效。浏览器看板使用独立授权，页面不提供日志正文、工具参数或完整时间线。若第二个窗口也必须属于 DSH Desktop，则需要桌面壳的窗口接口。 [DSH 窗口贡献提案 #8044](https://github.com/deepseek-ai/deepseek-harness/discussions/8044)

## English

### Choose a layout

| Layout | How to use it |
| --- | --- |
| Conversation and live board side by side | Open the conversation and plugin in **DSH Web**, then select **Detach**. With pop-ups allowed, the board opens in a second browser window. Both windows use the same Web Host. |
| DSH Desktop board alongside another app | Select **⤢ Fill window**, then use Windows `Win + Left / Right` to snap DSH and the other app. The board uses the original DSH window. |
| DSH Desktop conversation and its live board in separate windows | Select **Browser board** in the updated plugin. The live summary opens in the system browser. If the browser opens a tab in an existing window, drag it out before snapping the two windows. |

[Windows Snap documentation](https://support.microsoft.com/en-gb/windows/experience/snap-your-windows)

### What failed

1. **Test the route and the window separately.** A 200 from `/agent-workflow/view?root=…` confirms that the request returned HTML. Also verify that a second window opens and that its `/agent-workflow/map` request receives live data. With `noopener`, a successful `window.open()` can return `null`. [MDN: window.open](https://developer.mozilla.org/en-US/docs/Web/API/Window/open)
2. **The desktop shell owns window creation.** In the Windows `0.2.2-rc.3` package, the main-window handler in `app.asar/lib/main.js` denies child windows and forwards only HTTP(S) URLs to the system browser. Resolving a relative board path on Desktop produces a `dsh-app://app/…` address, which belongs to the desktop shell. Picture-in-Picture also failed in this attempt and uses an always-on-top surface. [DSH Desktop architecture](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/README.md) · [Picture-in-Picture API](https://developer.mozilla.org/en-US/docs/Web/API/Document_Picture-in-Picture_API)
3. **An external browser still needs access to the same Host.** The Desktop shell forwards authenticated requests to its own Host. Copying the Desktop address or starting a separate `dsh web` process does not connect the browser to the original live session. Use one Web Host for the conversation and the live board.

When debugging clicks inside the panel, check that it mounts in `shell.overlay` and enables `pointer-events: auto`. Capture the SVG pointer only after movement exceeds 5 px so nodes still receive click events.

### Browser board access

The browser board connects to the running Desktop Host and displays its working phase, tool names, and counts. The link is local and scoped to the selected session. It expires after two hours or when the Host exits. It uses separate authorization and omits message text, tool arguments, and the full timeline. A second native DSH window requires a desktop shell API. [DSH window contribution proposal #8044](https://github.com/deepseek-ai/deepseek-harness/discussions/8044)
