# 发布到插件市场的步骤

当前状态：包名 `dsh-tool-pocket` 在 npm 上还没人占；本机没有 npm 登录（没有 `~/.npmrc`），也没有 `npm` / `git` 命令，只有 pnpm（能连 registry）。

两种发布路线，选一条。市场收录要求仓库里有 `dsh.bundle`、仓库创建满 1 天、加 `dsh-plugin` topic。

## 路线 A：GitHub 仓库 + 目录 PR（不需要 npm）

1. 在 GitHub 新建公开仓库 `dsh-tool-pocket`，把 `plugins/dsh-tool-pocket/` 里的文件传上去（GitHub 网页的 “Upload files” 也行）。
2. 把 `package.json` 里三处 `OWNER` 换成你的 GitHub 用户名。
3. 给仓库加 topic `dsh-plugin`。
4. 等满 24 小时（CI 会检查仓库年龄）。
5. Fork [awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)，在 `data/plugins/` 下加一个文件 `<你的用户名>__dsh-tool-pocket.yml`，内容用同目录的 `catalog-entry.yml` 模板（把 OWNER 换掉）。
6. 开 PR，标题比如 `Add <owner>/dsh-tool-pocket (tools): token-saving lazy tool pocket`。CI 过了之后等维护者读代码。

不发布 npm 也可以被收录。因为仓库没有构建步骤，市场从源码安装也能直接跑；如果想安装更快，可以在 GitHub Release 附一个 `pnpm pack` 生成的 tgz，并在条目里加 `tarball:` 字段。

## 路线 B：npm + 目录 PR（安装更顺）

1. 注册/登录 npm，建一个 Automation token。
2. 本机没有 npm 命令，用 pnpm 写 token：

   ```sh
   pnpm config set //registry.npmjs.org/:_authToken <TOKEN>
   # 或者手动写 %USERPROFILE%\.npmrc，内容：
   # //registry.npmjs.org/:_authToken=<TOKEN>
   ```

3. 把 `package.json` 里的 `OWNER` 换成 GitHub 用户名，然后：

   ```sh
   cd plugins/dsh-tool-pocket
   pnpm publish --access public
   ```

   发布前最好先 `pnpm pack` 看一眼包里有什么。
4. 其余同路线 A 的 1、3、4、5、6 步。

## 目录条目模板

见本目录 `catalog-entry.yml`。`category` 选了 `tools`，也可以选 `browser`（看维护者怎么归类）。

## 维护者会看什么

- 描述必须和代码一致（比如“35 个工具省 29 KB”这种数字，要对得上）；
- 代码真实可用，不是空壳；
- 源码不混淆、没有可疑的安装期行为；
- 不要一个 PR 塞多条。

## 可能被打回的点（提前想好怎么答）

- 用的是 `tools.view` / `tools.restrict` / 事件这类非公开 API → README 里已经写清依赖面和 fail-open 行为；
- 关键词放行可能误判多花 token → README 已说明，词表可配；
- 面板只有中文 → README 已说明；
- 状态路由的鉴权是“信任栅栏 + 同源兜底”，只适合本机 → README 已说明。
