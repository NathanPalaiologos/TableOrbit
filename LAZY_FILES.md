# Local Parquet reading

TableOrbit now queries a local Parquet file through DuckDB. The target is a file of at least 1 GB on disk. That capacity is **not yet validated**: the user requested small-sample checks and deferred generating a large benchmark file.

## Data flow

```text
Local path → host validates file → DuckDB reads footer/schema
    → user selects columns and typed filters
    → parameterized read_parquet query → at most 100 displayed rows
    → optional complete filtered extraction → existing panel mapping and validation
```

No upload, full-file JavaScript buffer, pandas DataFrame, or copy into a database is required. Metadata inspection reads schema and the footer row count. A page query asks for 101 rows, using the extra row only to determine whether Next is available. Projection and filter predicates are passed to DuckDB. Its Parquet reader can skip unused column chunks and row groups when statistics permit it, as described in the [DuckDB Parquet documentation](https://duckdb.org/docs/data/parquet).

The file remains immutable. Handles record size and modification time; a changed file must be reopened. One worker runs at a time per scanner. Each request uses a fresh Python process, so startup cost is included in interaction latency.

## Use

In the browser, choose **Scan Parquet**, enter an absolute local path, and click **Open**. Choose columns, add filters, then Apply selection. Previous/Next and Start row operate on the selected result. Filtered totals are not calculated automatically. All filters are combined with AND.

The development CLI can preselect the file:

```bash
node scripts/tableorbit.mjs open "C:/path/to/panel.parquet" --port 4318
```

Replace the example path with an existing file and visit the printed URL. `PANEL_SPACE_PYTHON` selects an existing Python with DuckDB. The engine is integrated through the local host but its Python dependency is not bundled into the extension. This machine has DuckDB 1.5.3. No package was installed for this change.

The VS Code Explore Data picker also accepts Parquet and passes its path to the same worker. Its native extension-host flow still needs a separate manual check.

## Semantics and limits

- Up to 24 projected columns and eight filters. Values are bound parameters; identifiers must occur in the schema. Comparisons use the source column's native type. Invalid conversions fail explicitly. Null checks use IS NULL / IS NOT NULL.
- Display values travel as text, with null represented separately. BIGINT IDs, leading zeros and DECIMAL digits survive the browser transport. Arithmetic after panel extraction still uses the existing JavaScript Number contract, which cannot retain arbitrary decimal precision.
- Pages follow source order for a single unchanged file. OFFSET is not an index: deep paging can scan preceding data and be slow. Filters that cannot prune row groups may scan most of the selected columns. Lazy reading does not guarantee constant-time access.
- Page results are bounded by 100 rows and 10 MB. DuckDB is configured with a 512 MB memory limit, one thread and a 1 GB spill limit. The memory setting is not a hard cap on total process RSS. The host terminates a query after 30 seconds or on Cancel. Complex/wide files may still hit these limits.
- **Open selection as panel** requests the entire filtered result from its beginning, regardless of the displayed page. It rejects oversized output rather than taking its first rows. Limits are 100,000 rows, 10 MB and 2,000,000 materialized cells, followed by the existing potential panel-cell guard and key validation.
- The mapped panel's summaries and figures cover that extracted selection only. Whole-file panel rotation, aggregation, figures and lazy multi-table joins are not implemented. CSV/JSON imports and Combine tables still use the existing bounded in-memory paths.
- Single local `.parquet` files only. Globs, datasets/directories, remote object storage, encrypted-file credentials and nested-type panel mapping are outside this iteration. Nested types can be displayed as text but do not receive native value filters. Date/timestamp text still needs the existing explicit time-format mapping.

The host binds to loopback. Scan requests require a matching Host, local Origin and a per-process session token. The VS Code bridge passes structured requests directly. These checks do not provide isolation from other trusted local processes.

## Small-sample validation

```bash
python tests/scan_test.py
```

Six focused checks on a generated 4,000-row fixture passed: footer count and 100-row pages, exact long integers/decimals and Unicode/nulls, complete filtered extraction independent of page offset, final/empty page boundaries and byte-budget rejection, typed null/decimal predicates, and identifier/value injection rejection. EXPLAIN confirms projection and the year predicate reach READ_PARQUET. Fixtures use temporary directories and are removed after tests.

This establishes query semantics, not 1 GB performance or memory use. No large file was generated and no real large dataset was scanned. The acceptance test still needed is an actual file of at least 1 GB, measuring open/first-page/deep-page/filter latency and peak process memory. A failure to finish within the resource limits would require revising paging or query execution before claiming that capacity.

Browser checks on another 4,000-row synthetic panel verified the first page, rows 3991–4000 with Next disabled, a year filter returning 20 records, projection to three columns, English/Chinese controls and extraction into a 20-entity, one-period panel. Unsafe integer IDs remained unchecked as measures. Host checks verified authenticated metadata/last-page responses, rejection of invalid Origin/session tokens, cancellation of an active worker and a successful query after cancellation. CLI help and JavaScript syntax checks passed. The VS Code host and 1 GB capacity remain unverified.

The core design question for the next iteration is whether all panel operations must stay on disk. If so, axes, summaries and figure inputs must become bounded DuckDB queries too; increasing the browser's import limit would not solve that requirement.
