# Extension release framework

The first target is a **desktop VS Code preview extension**. TableOrbit runs in the workspace extension host; local files and Python must exist on that host. The browser preview remains a development tool. This is not a browser-only/vscode.dev extension.

## Implemented

- Explicit VSIX file allowlist in package.json, checked by `npm run package:check`. Only the three curated public examples are included. Private benchmark data, Parquet files, logs, tests and the unused Three.js prototype are excluded.
- Commands to open a demo, explore a data file, or open a Parquet dataset folder. Explorer offers the appropriate file/folder command.
- Read-only Parquet custom editor with default file association, plus an installed-path agent CLI command. JSON Lines requests use the same scanner as the UI. See [AGENT_CLI.md](AGENT_CLI.md).
- Command/editor-based activation. No installed-extension startup panel. Restricted and virtual workspaces are declared unsupported because the host runs Python and needs filesystem access.
- A machine-scoped Python executable setting. `requirements-engine.txt` pins the tested DuckDB version. Matplotlib/Seaborn remain optional figure dependencies.
- A manual GitHub Actions packaging workflow. It creates a VSIX artifact and does not publish to Marketplace or create a GitHub release.

## Local checks and packaging

```bash
npm run package:check
node --test tests/flat.test.mjs tests/reader.test.mjs tests/interaction.test.mjs
python tests/scan_test.py
```

After explicitly choosing to install the official packaging tool:

```bash
npm install --no-save --package-lock=false @vscode/vsce@4.0.0
npm run package:vsix
```

Install the resulting VSIX in a development VS Code profile and verify both text and Parquet commands. The 2026-10-10 local check packaged and installed version 0.2.0 on Windows. Native Explorer opening, statistics, figure export and the installed CLI passed. See the repository test record, VSIX_LOCAL_TEST.md, for the artifact hash and remaining limits. The allowlist check is not a substitute for inspecting the actual archive with `vsce ls` and testing an extension host.

The custom-editor provider contract has a mocked API test and now has a native Windows smoke check. A competing Parquet editor required a workspace-specific association for default double-click opening. The existing Python environment worked without an override. Missing-Python setup and the complete theme/platform matrix remain untested.

## Before publication

`tableorbit-local` remains a local placeholder, not a verified Marketplace publisher. Set the real publisher and run `node scripts/package-check.mjs --publish` before an explicitly authorized release. Confirm dataset redistribution terms, complete VSIX installation checks on Windows/macOS/Linux as claimed, test absent/wrong Python environments and settle whether a later release will bundle an engine. No credential, publisher account, upload or marketplace publication has been created automatically.

The Python dependency makes this an installable prototype rather than a zero-setup extension. Do not market it as bundled or universal. Databricks and SQL Server connections are still outside this preview.

## Size and theme checks

The tested 0.2.0 VSIX is 753,277 bytes (735.62 KiB), including three public examples. The earlier in-memory compression estimate was about 0.75 MB. The tested artifact was packaged before the local test report was written. A proposed Windows x64 package with DuckDB Node Neo would total roughly 42.2 MB unpacked based on npm package metadata. Its compressed size has not been measured. It would still need a separate decision about replacing or supplying the Python figure renderer. See [ROADMAP.md](ROADMAP.md) for measurements and dependencies.

The interface now consumes VS Code theme colors and includes high-contrast and reduced-motion rules. Browser light/dark modes, menu focus and narrow/wide layouts were checked. Before publication, verify Dark+, Dark Modern, Light+, both high-contrast themes and theme switching in the actual extension host.

References: [VS Code publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension), [extension manifest](https://code.visualstudio.com/api/references/extension-manifest), [official vsce source](https://github.com/microsoft/vscode-vsce).
