# Local VSIX test, 2026-10-10

TableOrbit 0.2.0 was packaged with the official `@vscode/vsce` 4.0.0 tool and installed into the user's normal desktop VS Code profile. No Marketplace upload, publisher registration or GitHub release was performed.

## Environment and artifact

- Windows x64, VS Code 1.135.0, Node 24.15.0.
- Existing Python environment with DuckDB 1.5.3 and Matplotlib/Seaborn. Python is an external prerequisite, not bundled in the VSIX.
- Extension identifier: `tableorbit-local.tableorbit`.
- Package: `tableorbit-0.2.0.vsix`, 753,277 bytes (735.62 KiB), 46 archive entries.
- SHA-256: `3f9183a2237f5c0f2111049866805ac6cf001ffc8d0596f8349148d10bfd58e7`.
- Archive inspection found the required worker, CLI and webview files, with no Parquet, logs, environment files or node_modules. The three curated public examples are included.

The tests used a separate generated file named `panel sample.parquet`. No private research data was copied into the test directory or package. The file has exactly these records:

| firm | year | revenue |
|---|---:|---:|
| 001 | 2020 | 0 |
| 001 | 2021 | null |
| 002 | 2020 | 4 |

## Native VS Code checks

These actions were performed in the actual installed editor, not a browser preview or mocked API.

| Check | Result |
|---|---|
| Install local VSIX and locate installed extension | Passed |
| Explorer context menu | TableOrbit: Explore Data is present |
| Open With → TableOrbit | Opens the read-only editor and automatically reads the selected path |
| Default Explorer double-click | Passed after a workspace-only editor association was set; both existing tabs were closed before reopening |
| Raw file contents | Three rows, leading-zero IDs, numeric zero and null all retained |
| Select firm/year axes and run summary | N = 2, missing = 1, absent = 1, mean = 2, sample SD = 2.8284271247461903, quartiles = 1/2/3 |
| Draw a Nature line figure | Native webview preview rendered, N = 2, SVG/PDF/PNG export buttons enabled |
| Native Save As for SVG | Saved to the test directory; parsed as valid SVG, 9,488 bytes |
| Show Agent CLI Command | Output channel displayed the installed extension's script path, not a repository path |

The test folder initially opened in Restricted Mode, which correctly prevented this extension from running. The user explicitly trusted that folder. Trust was not disabled globally.

This machine already has Parquet Explorer installed. Its existing default took precedence on the first double-click. Open With could select TableOrbit without removing that extension. To verify automatic opening, only the generated test workspace received:

```json
{
  "workbench.editorAssociations": {
    "*.parquet": "tableorbit.data"
  }
}
```

Other workspaces and the existing Parquet extension were left unchanged. Users with competing editors can choose TableOrbit through Open With or set an association at their preferred scope.

## Installed CLI checks

`tests/installed-cli.mjs` launches Node against the **installed** script and uses the test directory as its working directory. It imports no repository implementation modules. It passed:

- Capability discovery, file/folder inspection and exact raw values.
- Reuse of the same query PID, with structured request/reply IDs.
- Cross-section and time-series slices, distinguishing missing values from absent observations.
- Complete-source statistics independent of the requested page offset.
- Native integer time filtering.
- Query plus actual SVG/PDF/PNG rendering and decoded output files. Headers were validated for all three formats.
- Recovery after an invalid-column request.
- Cancellation followed by a new worker using the same file handle.
- Clean shutdown on stdin EOF.

The CLI generated SVG/PDF/PNG files of 9,488 / 18,819 / 86,163 bytes. The test also writes a machine-readable result JSON alongside them.

## Repeat and limits

Install the artifact from a terminal:

```bash
code --install-extension ./tableorbit-0.2.0.vsix
code --locate-extension tableorbit-local.tableorbit
```

Run the installed CLI test with three arguments: the located extension directory, a Parquet fixture with the exact three rows above, and a test output directory. It writes generated figures and a result JSON to that output directory.

This establishes the local Windows path with the existing Python installation. It does not establish a zero-setup install, remote/WSL operation, other operating systems, or every VS Code theme. The export dialog currently starts in the extension installation folder; select an output folder when saving. Improving that default is a remaining usability issue, not an export failure. The large real-file benchmarks from the preceding iteration were not repeated during this packaging check.

Official workflow references: [packaging and installation](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) and [extension testing](https://code.visualstudio.com/api/working-with-extensions/testing-extension). This report was written after testing the artifact identified above and is not embedded in that artifact.
