# Event-data validation

Date: 2026-10-10. This checks reading and query behavior, not the validity of a research design.

## Sources and observation unit

Two private Parquet files supplied by the user contain the same 31,547 event records. File A is 2,189,963 bytes with 35 columns. File B is 1,963,550,607 bytes with 68 columns and large transcript-text fields. Each has one row group. Neither file, record extracts nor screenshots of its contents are included in this repository or the extension.

The event identifier is unique. Company plus event timestamp is not: 277 records have a missing company or timestamp, and duplicate pairs remain after excluding missing keys. Company plus call date also repeats. Event time, call date and fiscal period describe different things; none is substituted for another.

The reader therefore opens these files as records. Cross-section and time-series views reject invalid keys. It does not deduplicate, aggregate or discard records to force a panel. The 1,647 observed call dates can be used for a descriptive per-date figure. That choice gives each event equal weight; it is not a company-balanced estimate or an event-study design.

## Method and results

Windows, Node 24.15.0, DuckDB 1.5.3. Each file used a new agent CLI session with one reused Python worker. Requests selected five columns for pages and one numeric measure for summaries. Transcript-text columns were excluded. Queries used the full file unless a date and Boolean filter was explicitly supplied.

| Operation | File A | File B |
|---|---:|---:|
| Inspect, including worker startup | 1.844 s | 1.872 s |
| First 100-row projected page | 0.059 s | 0.066 s |
| Repeated page | 0.061 s | 0.059 s |
| Last page, 47 records | 0.065 s | 0.060 s |
| Full-record single-variable summary | 0.065 s | 0.056 s |
| Date- and Boolean-filtered summary | 0.059 s | 0.060 s |
| Mean by call date, 1,647 points | 0.073 s | 0.067 s |
| Sampled CLI process-tree peak | 153.9 MiB | 153.9 MiB |
| Worker lifetime peak working set | 107.2 MiB | 106.6 MiB |

Times are single-run request wall times, rounded, including JSON transport and the memory sampler. These are not cold-disk measurements, statistical latency estimates or figure-rendering times. Process-tree memory includes the Node CLI and its worker; it excludes the independent reference process and browser. Sampling was every 10 ms. DuckDB's configured limit does not bound total process memory.

Passed checks:

- First/repeated pages match. The final page contains 47 records and disables Next.
- N, missing count, mean, sample SD, min, max and continuous quartiles match a separately projected PyArrow/Pandas reference. Numeric tolerance is relative 1e-9 or absolute 1e-10.
- A 2020 date range combined with a Boolean match filter gives the same N and mean as the reference.
- Every per-date figure mean and count matches the reference, including all-missing groups.
- A UTC timestamp range preserves its bounds and plotted epoch coordinates. Missing figure times give a filter instruction; record summaries remain available after the error.
- Missing and duplicate panel keys fail explicitly. A subsequent page works in the same worker.
- The query plan includes the selected measures and date predicate, without transcript-text columns. Source size and modification time are unchanged after the run.

## Interaction decisions

The flow is source → column selection and filters → record table → optional panel, summary or figure. A source change clears the old source. A selection change marks the existing table as pending. Apply replaces the table only after a successful query.

Column search changes only which checkboxes are visible. It does not remove hidden selections. Figure Y uses all eligible numeric columns, independent of the table checklist. Summary defaults to record statistics; panel-key auditing is a separate checkbox. A rejected panel query offers a return to records. Enter opens the selected cell's text, with a 20,000-character display limit.

`web/scanner.mjs` owns these controls and builds query requests. `scripts/lazy_queries.py` retains strict panel validation and rejects missing figure times with an explicit filter instruction. No time resampling, source rewriting or automatic sample restriction was added.

## Interface and repository checks

Nine focused Node tests passed for request scope, input routing, the Explorer provider and worker recovery. Three focused Python checks passed for missing figure times, duplicate keys and calendar figures. The new request-scope tests are included in the manual package workflow.

Browser checks passed for column search without selection loss, pending-state controls, preserved tables after errors, record-view recovery, figures using hidden table variables, SVG export availability, cell details and English/Chinese labels. An empty result clears the old cell detail and disables Next. No browser console errors appeared. On the private event file, a rejected company/date mapping retained 100 displayed records; record-level summaries then returned 14 numeric-variable rows. No private records were saved as screenshots.

The Explorer image now contains only the context-menu entry and adjacent open commands, without a pointer. Local documentation links, packaged references, JPEG headers and the explicit extension payload passed validation. These checks do not replace a new native VSIX installation test.

## Limits

These results support bounded projection on this text-heavy file. They do not establish the cost of reading its full transcript columns or opening every large Parquet layout. The existing 100-row, 24-column, response-size and query-time limits still apply. A failed scan-plan or reference comparison would invalidate the performance claim for the intended query.

Event-relative time, composite panel keys and collision-resolution workflows remain unimplemented. A real event panel must specify its event identity and time meaning before using those features. The installed VSIX was not updated as part of this source-level change.
