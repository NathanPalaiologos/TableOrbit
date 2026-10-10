# TableOrbit: next steps

Updated 2026-10-10. Toolbar/themes, a persistent Python worker, direct Parquet panel/statistics/figure queries and agent CLI are implemented. Language migration remains deferred.

## Product direction

The core task is to open data, choose columns and time, move between table views, then produce a summary or figure. The Parquet reader now supports this task without extracting the whole panel into JavaScript. Integrating it with the main reader remains planned.

The UI now keeps Dataset, Variables and Create figure visible. Data, View and Settings contain the other controls. The browser has light, dark and system themes. The extension uses VS Code theme variables. English and Chinese share the layout. Publication figures keep their white background.

## Package size

The later [VSIX test](VSIX_LOCAL_TEST.md) measured a 753,277-byte artifact. Estimates below predate that package and the new documentation screenshots.

The explicit package file list was compressed in memory with Python ZIP/Deflate, level 6, including package.json. This estimates the payload, not a built or installed VSIX. Rounded decimal sizes remain appropriate after small documentation edits.

| Variant | Compressed payload | Uncompressed payload | Dependency |
|---|---:|---:|---|
| Current preview, three public examples | About 0.75 MB | About 3.18 MB | External Python and DuckDB. Figures also need Matplotlib/Seaborn. |
| Payload excluding examples, for comparison | About 0.11 MB | About 0.30 MB | Same dependencies. This is not a working alternative package: startup currently expects examples. |
| Proposed Windows x64 native-engine package | Not measured | About 42.2 MB before packaging overhead | Would bundle DuckDB Node Neo, but would still need a solution for the Python figure renderer. |

The native estimate adds current payload plus the npm registry's unpacked sizes for `@duckdb/node-api`, `@duckdb/node-bindings` and `@duckdb/node-bindings-win32-x64`, all at 1.5.6-r.1: 651,541 + 94,689 + 38,256,130 bytes. Those are package metadata, not installed dependencies. No native package was downloaded or installed. Other operating systems and architectures need their own measurements. Build separate platform packages rather than including every binary in one archive.

A VS Code extension uses the host's existing browser and Node runtime. We do not need to bundle an Electron application. Actual VSIX size, binary loading in the extension host, licenses and supported platforms must be checked before publication. See [RELEASE.md](RELEASE.md).

Metadata can be checked without installing packages:

```bash
npm view @duckdb/node-api@1.5.6-r.1 dist.unpackedSize dependencies --json
npm view @duckdb/node-bindings@1.5.6-r.1 dist.unpackedSize optionalDependencies --json
npm view @duckdb/node-bindings-win32-x64@1.5.6-r.1 dist.unpackedSize --json
```

## What other projects contribute

| Source | Useful approach | Application here |
|---|---|---|
| [DuckDB Parquet reader](https://duckdb.org/docs/lts/data/parquet/overview) | Projection and filter pushdown | Keep selected columns and typed time predicates in the query. Avoid converting the stored time column to text just to compare it. Pruning still depends on available statistics and file layout. |
| [DuckDB Node Neo](https://duckdb.org/docs/preview/clients/node_neo/overview) | Persistent connections, parameterized queries and chunked streaming results | A candidate for removing Python from the file reader. Bound the result sent to the webview rather than calling an all-rows conversion method. |
| [Perspective](https://github.com/perspective-dev/perspective) | Virtual scrolling and views backed by a local or remote query engine | Keep a small visible table in the browser. Move filtering and aggregation to the data engine. Borrow this separation without importing its full dashboard interface. |
| [VS Code webviews](https://code.visualstudio.com/api/extension-guides/webview#theming-webview-content) | Host theme variables, focus and lifecycle conventions | Follow the user's editor theme, release work when the panel closes, and save small view state rather than holding an invisible full dataset. |

These are architectural references, not benchmark rankings. Their published capabilities do not establish TableOrbit's speed.

## Where performance work should start

Implemented flow:

```text
Browser / VS Code / agent CLI -> validated view specification
    -> reusable Python worker -> DuckDB
    <- one page, summary rows or plot coordinates
```

One query runs per scanner, with a 30-second deadline and cancellation by terminating the worker. The next request starts a replacement. Idle workers exit after 60 seconds. Source handles survive replacement; bounded caches of key audits and sorted entity pages are rebuilt as needed. No dense entity × time × variable cube is constructed.

Direct Parquet statistics cover the full filtered source. Panel views validate keys first. Figures currently support lines and bars through the existing renderer. CSV/JSON and table assembly remain bounded in-memory operations. These are separate UI paths for now.

Paired real-file checks, using the same cached source metadata on both sides, reduced median 100-row latency from 1.764 to 0.279 seconds on source A and from 1.615 to 0.049 seconds on source B. Initial key validation and sorted entity enumeration remain the largest tested interaction costs. See [PARQUET_VALIDATION.md](PARQUET_VALIDATION.md). Keep the current languages until another measured bottleneck justifies a change.

Deep pagination is another separate problem. Unfiltered shard skipping already uses row counts. Filtered pages with large OFFSET values can still repeat work. Evaluate cursors or keyset paging with a stable, unique ordering key. Duplicate sort values need a tie-breaker. Do not silently treat file row order as a persistent identity.

Keep JSON for small pages initially. Arrow batches or typed arrays may reduce copying for larger responses, but add integration and packaging costs. Adopt them only after serialization or object allocation appears in a profile. The current reader already bounds pages and updates selection without rebuilding every cell. Virtual scrolling is a later alternative if measured scrolling latency warrants it.

## Feature priorities

| Order | Feature | Acceptance check |
|---|---|---|
| Implemented | Read panel slices, summaries and line/bar inputs directly from Parquet | Results match the in-memory implementation on a small fixture, including missing records, duplicate keys, quantiles and sample SD. Opening a large source never starts an unrequested full scan. |
| Partly implemented | Persistent worker; zero-setup engine remains deferred | Compare cold open, warm page/filter latency, peak memory, cancellation and shutdown against the current worker. Confirm exact integer IDs, decimals, nulls and timestamps. |
| Next | Column filter, sort and find in the main reader | Filters show their active scope. Sorting has deterministic ties. Statistics and exports use the stated selection, not just the displayed page. |
| After that | Save and reopen a view | Save source reference, mapping, filters, selected columns and figure settings. Detect a changed source. Do not embed raw data or credentials by default. |
| After that | Lazy joins and panel assembly | Preview row counts and unmatched keys. Enforce the chosen cardinality before execution. Never silently multiply observations or aggregate duplicate panel keys. |
| After that | Databricks and SQL Server connections managed by CLI | CLI handles authentication/profiles. UI lists tables and selects keys. Queries and limits run at the source. Test expiry, cancellation and permissions before claiming support. |
| Later | Column inspection and panel diagnostics | Show types, missingness, duplicate keys, time coverage and balance on request. Clearly distinguish sampled estimates from exact scans. |
| Later | Nested Parquet columns and schema evolution | Expand selected struct fields. Require explicit handling of incompatible shard types and missing columns. |
| Later | Figure workflow improvements | Save figure settings, preview labels at export size and reuse variable selections. A browser/vector renderer needs parity checks before replacing the existing publication output. |

No priority is assigned to free-flight 3D, an AI chat panel or additional decorative dashboards. The table remains the product's main surface.

## Language and quality decisions

Retain JavaScript for the UI. Keep DuckDB as the initial query engine. Changing the Python wrapper to Rust will not by itself improve DuckDB scans. Node Neo is the first migration candidate because it could remove environment setup for file reading and reuse connections. Rust becomes a candidate if a measured bottleneck remains in custom parsing, joins outside DuckDB or inter-process transfer, and a small implementation demonstrates a worthwhile gain.

Use a fixed, bounded benchmark before migrating: single-file and partitioned Parquet, narrow and wide projections, selective and nonselective time filters, first and deep pages, a summary, a join and cancellation. Compare identical results before comparing time. Separate cold and warm runs. Record p50/p95 latency, process and webview memory, response bytes and time to cancel. A proposed adoption gate is at least a 20% improvement on the target bottleneck without material regressions elsewhere, or removal of a user setup step at acceptable cost. This threshold is a project decision, not an industry standard.

Quality work should prioritize request races, close/cancel behavior, changed files, schema mismatch and precision at the engine/webview boundary. Differential tests should compare a small independent expected table with both execution paths. A successful query alone does not prove the panel keys or aggregation scope are correct.

Before committing to the backend, settle two questions: can a user install and open Parquet without configuring Python, and can every displayed summary be traced to a stated source and selection? The file engine experiment can answer the first. Lazy-query parity tests address the second. The remaining figure dependency must be reported separately.
