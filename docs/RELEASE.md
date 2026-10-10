# Develop and package TableOrbit

To install an existing package, use the [installation guide](INSTALL.md).

Commands below run from the repository root. They use Bash syntax. The pinned packaging tool requires Node.js 22 or later and npm.

## Build a VSIX

Clone the source if you do not have it:

```bash
git clone https://github.com/NathanPalaiologos/TableOrbit.git
cd TableOrbit
```

Install the packaging tool, check the file list, then create the package:

```bash
npm install --no-save --package-lock=false @vscode/vsce@4.0.0
npm run package:check
npx --no-install vsce ls --no-dependencies
npm run package:vsix
```

For version 0.2.0, the output is `tableorbit-0.2.0.vsix` in the repository root. The commands create a local package. They do not publish it.

`package.json` lists each file to include. Tests, local archives, logs and private Parquet sources are excluded. Documentation screenshots are included so the packaged README can display them.

The manual **Package preview extension** GitHub Actions workflow also creates a VSIX artifact. It does not create a GitHub release or publish to the Marketplace. A repository maintainer can start it from the Actions tab.

## Run the browser preview

No frontend build or package install is needed:

```bash
node scripts/serve.cjs
```

Open `http://127.0.0.1:4317`. The server binds to loopback. Parquet and figures use local Python processes.

To choose an existing Python executable, replace the example path:

```bash
PANEL_SPACE_PYTHON='/path/to/python' node scripts/serve.cjs
```

## Run an extension development host

```bash
code --new-window --extensionDevelopmentPath="$PWD" "$PWD"
```

Run **TableOrbit: Open Grunfeld Demo** in the new window. Configure `panelSpace.pythonPath` before testing Parquet or figures.

The extension uses the workspace extension host. Files and Python must exist on that host. Restricted Mode, virtual workspaces and vscode.dev are unsupported.

## Check a change

Start with the checks relevant to the changed files. These checks cover documentation paths, packaging and the Explorer provider:

```bash
npm run docs:check
npm run package:check
node --test tests/extension.test.cjs
```

Reader changes have focused Node tests in `tests/`. Parquet changes have `tests/scan_test.py` and `tests/worker_test.mjs`. Real-data stress runs are separate from routine tests. They write generated results to `tests/output/`.

Before distributing a VSIX, install that exact file and check:

1. Open the Grunfeld demo.
2. Open a Parquet file from Explorer.
3. Query a panel slice and summary.
4. Export a figure to a chosen folder.
5. Run the installed agent CLI.

Use [VSIX_LOCAL_TEST.md](VSIX_LOCAL_TEST.md) as the record of the previous test. New source or documentation edits do not update an already-built VSIX.

## Release status

Version 0.2.0 was packaged and installed on Windows on 2026-10-10. Explorer opening, summary statistics, figure export and the installed CLI passed. The artifact was 753,277 bytes. This is the size of that tested artifact, before the new documentation screenshots.

`tableorbit-local` is a local publisher placeholder. It is not a verified Marketplace publisher. Marketplace publication remains a separate release decision.

Before publication, verify publisher ownership and dataset redistribution terms. Test missing Python, supported operating systems, remote hosts and the full theme matrix. Python still requires separate installation. Databricks and SQL Server are not implemented.

See [VS Code publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) for the official packaging and publication process.
