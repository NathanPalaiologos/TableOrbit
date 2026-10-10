# Agent CLI

TableOrbit accepts JSON Lines on stdin and returns JSON Lines on stdout. It uses the same read-only Parquet query engine as the browser and VS Code extension. It does not need an open webview or HTTP server.

From the repository:

```bash
node scripts/tableorbit.mjs agent
```

Set `PANEL_SPACE_PYTHON` to an existing Python with DuckDB if needed. Figures additionally need Matplotlib and Seaborn. In the extension, run **TableOrbit: Show Agent CLI Command** to obtain the installed script path and configured interpreter. A VSIX does not automatically put `tableorbit` on the shell's PATH. Node must be available to the agent process. Remote hosts need their own paths and environment.

## Protocol

Send `{ "requestId": "unique-id", "spec": { ... } }`, one object per line. Success returns `{ "requestId": ..., "ok": true, "result": ... }`. Failure returns `ok: false` and an `error` string. Errors leave the session usable. Replies may include a worker PID and query duration for diagnostics.

Start with:

```json
{"requestId":"help","spec":{"action":"capabilities"}}
```

Inspect an absolute file or coherent dataset-folder path. Replace this example path with an existing source:

```json
{"requestId":"open","spec":{"action":"inspect","path":"C:/datasets/panel.parquet"}}
```

The response supplies an opaque `id`, source name, schema, row count, file count and bytes. Reuse the returned ID. Do not supply a snapshot or SQL. Up to four source handles are retained per CLI session. Reopen if a source changes or its handle expires. Worker cancellation/restart preserves host-side handles, but ending the CLI session does not.

The following requests illustrate the synthetic test schema `firm_id`, `year`, `revenue`. Use columns returned by your own inspection, and replace `SOURCE_ID` with its returned ID. Send the next request after receiving the previous reply. Only `cancel` should interrupt an active query.

```json
{"requestId":"rows","spec":{"action":"page","id":"SOURCE_ID","columns":["firm_id","year","revenue"],"offset":0}}
{"requestId":"keys","spec":{"action":"axes","id":"SOURCE_ID","columns":["revenue"],"entity":"firm_id","time":"year"}}
{"requestId":"cross","spec":{"action":"panel","id":"SOURCE_ID","columns":["revenue"],"entity":"firm_id","time":"year","view":"cross","period":"2000","offset":0}}
{"requestId":"series","spec":{"action":"panel","id":"SOURCE_ID","columns":["revenue"],"entity":"firm_id","time":"year","view":"series","variable":"revenue","offset":0,"timeOffset":0}}
{"requestId":"stats","spec":{"action":"summary","id":"SOURCE_ID","columns":["revenue"]}}
{"requestId":"plot","spec":{"action":"figure-data","id":"SOURCE_ID","columns":["revenue"],"time":"year","variable":"revenue","plot":"line","aggregation":"mean"}}
```

`axes` validates nonmissing, unique entity/time keys and returns observed times. It can scan all selected key columns. `panel` returns at most 100 entities and 24 periods or selected measures. Its `present` matrix distinguishes an absent observation from a null measure. Entity rows are sorted by the native key. `offset` counts entities in panel views and records in raw pages. Raw source order is not a durable row identifier.

`summary` covers every filtered record, regardless of offset. Add entity/time keys to validate the panel and count absent observations; omit them for record-level summaries. N counts nonmissing values. Each source record has equal weight. Statistics use sample SD and continuous quartiles. Unsafe integer measures are rejected rather than silently rounded.

All data queries accept typed filters and an inclusive time range, for example:

```json
{"filters":[{"column":"revenue","op":"notnull"}],"timeRange":{"column":"year","start":"2000","end":"2010"}}
```

Supported filter operators: `eq`, `ne`, `lt`, `le`, `gt`, `ge`, `null`, `notnull`. Values use the source type. Filters combine with AND. This snippet is part of a query spec, not a standalone action.

## Figures and cancellation

`figure-data` returns coordinates, per-point N and scope metadata. Use `figure` with the same fields to also render. Optional `preset` values are `nature`, `seaborn`, `icml`, `aer`; `size` is `single` or `double`. Set `xlabel` and `ylabel` to include units. The result contains `data` and `rendering`, whose `files` object has base64 SVG, PDF and PNG. The CLI does not write files automatically. The agent can decode the chosen artifact to a user-authorized output path.

Plots support `line` and `bar`. Statistics are `mean`, `median`, `sum`, `min`, `max`, `sd`, `count`. For a single entity's raw values, use `aggregation: "none"`, explicit entity/time keys and `figureEntity` as a string. This validates the keys and keeps absent periods as line gaps. No smoothing or inferential intervals are added.

```json
{"requestId":"stop","spec":{"action":"cancel"}}
```

Cancel terminates the active query worker. The interrupted query returns an error and cancel returns `cancelled: true`. The next query starts a worker. Rendering uses a separate process and timeout; query cancellation does not stop an already-running renderer. Closing stdin waits for pending work and closes the scanner.

## Boundaries

This CLI currently handles local Parquet files/folders. It does not expose CSV imports, table assembly, Databricks or SQL Server. It is a local process with the launching user's filesystem permissions, not an access-control sandbox. Requests are limited to 64 KB, query responses to 12 MB, queries to 30 seconds, and figures to 4,096 line periods or 40 bars. See [LAZY_FILES.md](LAZY_FILES.md) for memory, schema and precision limits.
