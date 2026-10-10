# Local Parquet reading

TableOrbit queries a local Parquet file or a coherent folder of Parquet shards through DuckDB. Read-only tests passed on a 1.24 GB file with 221 million rows and a nine-file dataset with 7.49 million rows. See [PARQUET_VALIDATION.md](PARQUET_VALIDATION.md) for measured latency, memory and acceptance limits.

## Data flow

```text
Local file/folder -> frozen shard list and schema -> reusable DuckDB worker
    -> projected raw page or entity/time slice -> bounded table
    -> filtered statistics -> summary rows
    -> grouped values or one entity -> plot coordinates -> figure renderer
```

No upload, full-file JavaScript buffer, pandas DataFrame, or copy into a database is required. Metadata inspection reads schema and the footer row count. A page query asks for 101 rows, using the extra row only to determine whether Next is available. Projection and filter predicates are passed to DuckDB. Its Parquet reader can skip unused column chunks and row groups when statistics permit it, as described in the [DuckDB Parquet documentation](https://duckdb.org/docs/data/parquet).

The file remains immutable. Handles record size and modification time; a changed file must be reopened. Each scanner reuses one Python process and DuckDB connection. Only one query runs at a time. Cancel or the 30-second deadline terminates the worker; the next request starts a replacement. After 60 idle seconds, the worker exits to release memory. File handles survive worker replacement, while axis and entity-page caches do not.

## Use

In the browser, choose **Scan Parquet**, enter an absolute local path, and click **Open**. Expand Columns and time filters, choose projected columns and an optional inclusive time range, then Apply. Time bounds use the native source type, including DATE and TIMESTAMP. String bounds use lexical ordering, so non-ISO date strings should not be treated as chronological ranges. Previous/Next and Start row operate on the selected result. Filtered totals are not calculated automatically. All filters are combined with AND.

The development CLI can preselect the file:

```bash
node scripts/tableorbit.mjs open "C:/path/to/panel.parquet" --port 4318
```

Replace the example path with an existing file and visit the printed URL. `PANEL_SPACE_PYTHON` selects an existing Python with DuckDB. The engine is integrated through the local host but its Python dependency is not bundled into the extension. This machine has DuckDB 1.5.3. See [Python setup](INSTALL.md#set-up-python-for-parquet-and-figures) for dependencies.

In VS Code, Parquet is registered with a read-only custom editor. Explorer opens it in TableOrbit by default unless another editor association takes precedence. CSV/TSV/JSON files have an Explore Data context command. Open Parquet Dataset Folder passes a directory to the same engine. The provider contract is tested with a mocked VS Code API; native Windows installation passed. See [the installation test](VSIX_LOCAL_TEST.md). Agents use the same query implementation through [AGENT_CLI.md](AGENT_CLI.md).

## Semantics and limits

- Up to 24 projected columns and eight filters. Values are bound parameters; identifiers must occur in the schema. Comparisons use the source column's native type. Invalid conversions fail explicitly. Null checks use IS NULL / IS NOT NULL.
- Display values travel as text, with null represented separately. BIGINT IDs, leading zeros and DECIMAL digits survive the browser transport. Arithmetic after panel extraction still uses the existing JavaScript Number contract, which cannot retain arbitrary decimal precision.
- Files follow sorted path order, with source order inside each file. Unfiltered paging skips whole shards using cached footer counts. OFFSET within a file is not a general-purpose index and may still be slow. Filters that cannot prune row groups may scan most of the selected columns. Lazy reading does not guarantee constant-time access.
- Page results are bounded by 100 rows and 10 MB. DuckDB is configured with a 512 MB memory limit, one thread and a 1 GB spill limit. The memory setting is not a hard cap on total process RSS. The host terminates a query after 30 seconds or on Cancel. Complex/wide files may still hit these limits.
- **Extract selection…** requests the entire filtered result from its beginning, regardless of the displayed page. It rejects oversized output rather than taking its first rows. Limits are 100,000 rows, 10 MB and 2,000,000 materialized cells, followed by the existing potential panel-cell guard and key validation.
- Choose Cross-section or Time-series and set entity/time columns to query a panel directly. Keys must be nonmissing and unique in the filtered source. Duplicate keys are rejected, never aggregated implicitly. The engine retains at most eight axis audits (up to 4,096 times each) and eight entity pages (101 IDs each). The first key audit and sorted entity page can scan key columns across the source.
- Summary statistics query all filtered records, independent of the displayed page. N excludes null values; sample SD uses n−1 and quartiles use continuous linear interpolation. Missing values and absent entity/time records are separate. Without keys, absent records show Not checked. Each observed record has equal weight.
- Create figure inside the Parquet reader queries the selected variable directly. Lines allow up to 4,096 periods; bars allow up to 40. Choose a per-period statistic or one entity's raw values. Raw lines retain absent-period gaps. Numeric time and ISO dates/timestamps support lines; other text time labels support bars. SVG/PDF/PNG use the existing four presets. Other plot types still use the small-file reader.
- Integer measures outside JavaScript's safe integer range are rejected for statistics and figures. They remain readable as exact text and usable as keys. Statistical arithmetic is not arbitrary-precision decimal arithmetic.
- The main reader's summaries and figures still cover its imported/extracted selection only. Lazy reading stays in the separate Parquet dialog. CSV/JSON imports, Combine tables and lazy multi-table joins have not changed.
- Local files or folders containing up to 1,024 `.parquet` files, including subfolders. The physical schemas must match exactly. New files are included only after reopening the folder. Same-schema duplicates are not deduplicated; select one dataset root rather than a parent containing multiple versions. Delta roots are rejected because transaction logs are not interpreted. Remote object storage, encrypted-file credentials and nested-type panel mapping are outside this iteration. Nested types can be displayed as text but do not receive native value filters. Date/timestamp text still needs the existing explicit time-format mapping.

The host binds to loopback. Scan requests require a matching Host, local Origin and a per-process session token. The VS Code bridge passes structured requests directly. These checks do not provide isolation from other trusted local processes.

## Small-sample validation

```bash
python tests/scan_test.py
```

The original raw-scan checks on a generated 4,000-row fixture cover: footer count and 100-row pages, exact long integers/decimals and Unicode/nulls, complete filtered extraction independent of page offset, final/empty page boundaries and byte-budget rejection, typed null/decimal predicates, and identifier/value injection rejection. EXPLAIN confirms projection and the year predicate reach READ_PARQUET. Fixtures use temporary directories and are removed after tests.

The original small-fixture checks are now supplemented by the real-data validation in [PARQUET_VALIDATION.md](PARQUET_VALIDATION.md). No large synthetic file was generated.

Browser checks on another 4,000-row synthetic panel verified the first page, rows 3991–4000 with Next disabled, a year filter returning 20 records, projection to three columns, English/Chinese controls and extraction into a 20-entity, one-period panel. Unsafe integer IDs remained unchecked as measures. Host checks verified authenticated metadata/last-page responses, rejection of invalid Origin/session tokens, cancellation of an active worker and a successful query after cancellation. CLI help and JavaScript syntax checks passed. The later [Windows installation test](VSIX_LOCAL_TEST.md) covers the native host.

The 2026-10-10 update adds focused tests for direct panel slices, summary scope, missing observations, zero values, duplicate keys, date figures, unsafe integers and floating-point key transport. Worker tests cover reuse, errors, cancellation and replacement. Real-data results and their scope are recorded in PARQUET_VALIDATION.md.

## Partition and schema policy

Hive directories such as `year=2020/region=001` are recognized by DuckDB. Partition auto-casting is disabled to preserve lexical identifiers such as 001. This means an inferred partition-only year is text; fixed-width four-digit years support lexical ranges, while irregular numeric strings do not. Native typed time columns retain typed comparisons. Native predicates are applied before display values are cast to text, allowing projection, row-group and Hive file pruning. See the [DuckDB Hive guide](https://duckdb.org/docs/current/data/partitioning/hive_partitioning).

A folder is an explicit user-selected dataset. The engine validates metadata without loading records, rejects incompatible schemas and freezes a file list in the host. Each query checks source size and modification time before and after use. Same-size edits preserving timestamps cannot be detected by this lightweight check. Reopen after changes. Metadata is cached for the session, never persisted beside the user's data.

The host owns snapshots and SQL construction. Browser requests contain opaque handles, column choices and bound values, not SQL or trusted metadata. `scan.cjs` handles cancellation and deadlines; `scan_file.py` validates the source, compiles predicates and bounds results. Removing footer caching would repeat schema work and lose the shard-offset optimization.
