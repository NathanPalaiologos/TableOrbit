# Open files

The reader starts empty. Choose Open file, paste records from Data, or use Open local path. Examples appear only in Quick guide. A normal file opens as a record table without asking for an index.

In VS Code, Open file uses the native file picker. The Explorer action uses the same reader. In the browser, text and small binary files can also be dropped onto the page. Browser file pickers cannot expose the original path of a large Parquet file: use Open local path for that case. No copy is needed for local-path Parquet queries.

## Formats

| Input | Reader and behavior |
|---|---|
| CSV, TSV, TAB, TXT, PSV | UTF-8 or BOM-marked UTF-16. CSV/TXT/PSV detect comma, tab, semicolon or pipe from the unquoted header. TSV/TAB use tabs. Header-only files open as empty tables. |
| JSON, JSONL, NDJSON | Arrays of records or line-delimited records. A JSON object opens as one record; an empty array opens an empty table. Booleans display as text. Objects and arrays remain in their cells as JSON text, without expanding rows. |
| XLSX, XLSM | Python with openpyxl. Select one worksheet at a time. The first row supplies column names. Dates become ISO text. Formulas use cached values; the reader does not calculate formulas or run macros. |
| Feather V2, Arrow IPC file/stream | Python with pyarrow. Batches are bounded before conversion. Integer IDs remain exact text. Feather V1 is not supported. |
| Stata DTA | Python with pandas. Rows are read in chunks. String identifiers retain leading zeros. Labelled categories retain their stored codes, not their value-label display. |
| Parquet file or matching-schema folder | DuckDB reads metadata and selected pages. See [Parquet limits](LAZY_FILES.md). |

Text imports and browser uploads are limited to 10 MB each. Binary local-path imports are limited to 64 MB at source and 10 MB of converted record values. In-memory tables allow at most 100,000 rows and 2,000,000 materialized cells. Limits reject the import; they do not silently return a sample. Use Parquet for larger tables.

Optional reader dependencies, installed in the Python environment configured for TableOrbit:

```bash
python -m pip install openpyxl pyarrow pandas
```

Install only the readers you need. No dependency is installed automatically. Legacy XLS, SAS/SPSS, compressed text, password-protected workbooks and remote database sources are not supported. Invalid encoding, malformed rows and duplicate/empty headers produce an error while the current table stays available.

## Select an index

Use Choose index only when you need the panel views and their analysis controls. The reader suggests keys from column names, full-column formats and unique pairs. Review the entity, time and numeric variables, then select Apply index. Ambiguous dates remain a choice. Repeated or missing keys fail validation without changing the source records.

Original records returns to all imported columns, including text fields omitted from the panel. Record-table arrows move cells; Enter expands the selected value. Panel arrows retain the layer/rotation controls. No synthetic key, aggregation or time conversion is applied merely to open a file.

Excel and Stata dates without a timezone remain without a timezone. They can be read as records, but the current panel timestamp mapper requires an explicit offset. Choose a supported calendar representation before mapping; the reader does not guess a timezone. Blank, omitted and null JSON cells display as blanks in record view. Panel mapping retains its documented missing-value rules.

## Switch tables

Open tables contains only files or examples you opened. Up to five tables remain in the current session. Close table removes an entry without modifying its source. Reaching the limit asks you to close a table rather than silently discarding one.

Record tables retain the selected cell. Panels retain orientation, layer, included entities and variable choices. Switching back to Parquet reopens its handle and reapplies saved columns, filters and view choices; its page and layer restart. Worksheet changes replace the current workbook view rather than joining sheets. Reloading the page starts a new session.

## Implementation and checks

```text
File picker, Explorer, paste or local path
  -> text parser or bounded Python format reader
  -> original record table
  -> optional index validation
  -> panel reader

Parquet path -> existing DuckDB scanner -> bounded source table
```

`scripts/files.cjs` routes files and bounds file size, response size and Python duration. `scripts/read_table.py` handles binary conversion without rewriting the source. `web/records.mjs` renders pages; `web/app.mjs` owns open tables and optional mapping. Removing the record stage would again make successful opening depend on valid panel keys.

Focused tests cover delimiters, encodings, text-only and repeated-key records, Boolean/nested JSON, empty tables, exact Arrow integer IDs, Excel worksheets, Stata chunks, malformed files, limits and existing panel detection. Browser tests cover actual file selection, multiple imports, worksheet selection, record/panel position restoration and Parquet opening. The updated VSIX was installed and tested in desktop VS Code on 2026-10-10. Explorer opening, index selection, worksheet and table switching, and malformed-file recovery passed. See [the installation test record](VSIX_LOCAL_TEST.md) for the artifact checksum and limits.

Validation on 2026-10-10 passed 37 focused Node tests, four Python format tests and one local HTTP integration test. The HTTP check covers local-session enforcement, quoted Windows paths, missing-file errors and recovery. Browser checks also passed for the five-table limit without eviction, retained Parquet time filters, invalid-index recovery, Chinese controls and the empty initial screen. No browser console errors appeared in the checked flows.
