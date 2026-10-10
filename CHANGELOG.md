# Changelog

## 0.2.0 preview

- Reuse a DuckDB query process, with cancellation, restart and idle shutdown.
- Query Parquet panel slices, full-filter summaries and line/bar inputs directly.
- Cache bounded key audits and entity pages, and share quantile calculation state.
- Add a JSON Lines agent CLI and a read-only Parquet editor for VS Code Explorer.

- Add browser light/dark/system themes and VS Code theme color bindings.
- Group import, view and settings controls into top toolbar menus.
- Shorten English and Chinese help text and restore menu focus after dialogs close.
- Scan local Parquet files and coherent folders with column and time selection.
- Skip whole shards for unfiltered paging using cached footer counts.
- Flatten mapped panels into observed entity/time rows without aggregation.
- Add a VS Code dataset-folder command and explicit packaging file list.
- Retain Python as an external dependency. Marketplace publication is pending.
