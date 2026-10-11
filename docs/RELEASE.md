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

The Git repository also excludes built VSIX files, test outputs, machine-specific settings, the retired README snapshot and the dated raw benchmark JSON. Keep public fixtures required by tests and the shared `.vscode/launch.json`. New local checks should write to `tests/output/`. Removing a file from Git tracking leaves earlier commits unchanged.

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

1. Use Explorer's **TableOrbit: Explore Data** action on CSV, JSON, XLSX, Feather and DTA fixtures. Confirm that source records open before index selection.
2. Choose an index on a panel fixture. Open another file and return to the first table. Check its index and reading position.
3. Switch Excel worksheets. Try a malformed file, then a valid file. Check that failure does not replace the current table.
4. Open a Parquet file from Explorer. Query a panel slice and summary.
5. Export a figure to a chosen folder and run the installed agent CLI.
6. Open a demo explicitly through the Quick guide.

Use [VSIX_LOCAL_TEST.md](VSIX_LOCAL_TEST.md) as the record of the previous test. New source or documentation edits do not update an already-built VSIX.

## Release status

The updated 0.2.0 preview was packaged and installed on Windows on 2026-10-10. The artifact is 1,104,769 bytes (1.05 MiB). Explorer opening across six file formats, index selection, Excel worksheet switching, table switching, error recovery and the installed CLI passed. The [local test record](VSIX_LOCAL_TEST.md) identifies the tested package by checksum and separates this run from the earlier 753,277-byte build.

`tableorbit-local` is a local publisher placeholder. It is not a verified Marketplace publisher. Marketplace publication remains a separate release decision.

Before publication, verify publisher ownership and dataset redistribution terms. Test missing Python, supported operating systems, remote hosts and the full theme matrix. Python still requires separate installation. Databricks and SQL Server are not implemented.

See [VS Code publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) for the official packaging and publication process.
