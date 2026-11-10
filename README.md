# dsh-tool-pocket

Keep a token-heavy tool group installed in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) but out of the model-facing tool schema until a turn actually needs it.

A browser-automation plugin can ship 30+ tools and ~29 KB of JSON schema. That is roughly 8k tokens of tool definitions on **every** request, even when nobody is browsing. Installing and uninstalling on demand is slow (pnpm, approvals, half-finished states). This plugin keeps the package installed, hides its tool group behind a tiny meta tool, and opens it only when the conversation needs it.

## What it does

- On each agent, discovers global tools whose names match `prefixes` (default `ego_`), registers one small meta tool (`browser_tools`), and hides the group with a per-agent scope restriction.
- When the user's message mentions browser work ("网页", "截图", "表单", “登录后”, …), the group opens **before the turn's tool set is resolved**, so the very first model step can use it.
- Unless hold mode is on, the group locks again when the turn ends. `hold: true` keeps it open until `lock: true` (or the panel's **收起来** button).
- A small panel in the bottom-right corner (`shell.overlay`) shows the current session's state: how many tools are locked, which are open, whether hold mode is on, and whether the restriction actually took effect.
- If anything goes wrong — meta tool registration, restriction mount, core API drift — the group stays **visible** instead of being locked away. Failing open costs tokens; failing closed removes capability.

## Install

From the DSH plugin market (once listed) or:

```sh
dsh plugin add github:<owner>/dsh-tool-pocket
```

No build step is required: the package is plain ESM plus a handwritten client bundle.

## Configuration

The row is inserted by `cordis.patch.yml`; edit that file after installing from source, or use the profile patch:

```yaml
- id: tool-pocket
  config:
    prefixes: [ego_]          # which tool groups to hide
    metaTool: browser_tools    # the one small tool that opens the group
    hint: 浏览器：打开网页、点击、填表、截图、读页面、抓接口、登录后页面、下载。
    turnEnd: true              # relock when the turn ends
    hold: false                # default hold mode
    autoOpen: true             # keyword router
    openWords: [网页, 浏览器, 截图, 表单, 登录后, 抓接口, 抓包, 下载文件, 页面]
    closeWords: [收起工具, 收起来, 关掉工具, 锁上工具, 收起口袋, 关掉口袋]
```

The meta tool takes:

- `names?: string[]` — exact deferred tools to open; omit to open the whole group.
- `hold?: boolean` — keep them open across turns until `lock: true`.
- `lock?: true` — close the group now and leave hold mode.

## Compatibility and known limitations

- Written and tested against DSH `0.2.2-rc.1`. It depends on `tools.view`, `tools.restrict`, `agent/inbox/inserted`, `agent/pre-step`, and `agent/turn-stopping`; these are implementation surfaces, not a documented stable API. If they change, the plugin fails open and the panel reports `degraded`.
- Keyword routing is not understanding. A message that merely mentions a page opens the group for that turn and spends the tokens; a browser task phrased without a keyword may not open it. The word lists are configurable.
- The meta tool is registered at plugin level. Before 0.8.0 it was registered inside each agent scope, and repeated hot reloads could leave a stale tool and restriction behind; upgrading from such a state needs one DSH restart.
- Panel text is currently Chinese only.
- The state route is same-origin only: it checks the shared connection trust fence and accepts a browser-marked same-origin request. It is not meant to be exposed to the internet.

## Development

```sh
node plugin-tests/pocket-test.mjs   # offline logic + route tests
```

The test uses a stand-in tool registry that mirrors the restriction/view semantics; it covers hiding, releasing, hold/lock, keyword auto-open, per-session state, ETag/304, the trust fence, the close route, and the degraded path.

## License

MIT. See [LICENSE](./LICENSE).

---

# 中文说明

把一组吃 token 的工具常驻安装，但默认锁起来；需要的时候才放行，回合结束自动收回。

浏览器类插件往往带 30 多个工具、近 29 KB 的工具说明，折合 8 千 token，每一轮都要带——哪怕这次根本不用浏览器。装装拆拆又慢又要批准。这个插件把整组装进「口袋」：平时的工具表里只有一个小工具 `browser_tools`。

消息里出现「网页 / 浏览器 / 截图 / 表单 / 登录后 / 抓接口」这类词时，它会在这一回合解析工具表之前自动放行，第一步就能用；默认回合结束收回，也可以 `hold: true` 一直开着，等 `lock: true` 或面板上的「收起来」。

右下角胶囊按当前会话显示锁着几件、开了几件、是不是保持模式；限制没挂上会变红提示。任何一步失败都直接放行，不会把工具锁死。

兼容性与限制：按 DSH `0.2.2-rc.1` 开发和实测，用到的 `tools.view` / `tools.restrict` / 事件不是公开稳定 API；升级后可能失效，失效时面板会显示 degraded。关键词不是语义理解，误判会白花 token；面板文字目前只有中文。
