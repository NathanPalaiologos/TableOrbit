# Multi-table panels and database connections

Decision recorded 2026-10-08: the user selected **CLI login/connection with visual table selection and panel assembly**. SQL knowledge should not be required for the normal workflow.

## Implemented in this iteration

`Combine tables` opens a local two-file composer. It supports CSV, TSV, JSON and JSONL/NDJSON through the existing parser. Users choose an operation, explicit key pairs, expected relationship and right-hand columns. Checks run over every loaded record before opening the result in the existing axis-mapping dialog.

| Operation | Observation contract | Current support |
|---|---|---|
| Add variables with a left join | Preserve all left observations | One-to-one or many-to-one, including composite keys |
| Keep matched observations | Explicitly restrict the left sample | Inner join with row-loss counts |
| Append individuals or periods | Stack the two sources | Same column names required, final panel keys checked by importer |
| Separate series to panel | One named entity for each series | Existing series import and append workflow |
| Wide time-series columns to panel | Columns represent entities measuring the same quantity | Existing explicit wide-series importer |
| Dates in column names, combined entity/time construction | Requires an explicit reshape rule | Not implemented |
| Many-to-many, full outer, nearest-time or interval joins | Can change the observation unit or introduce allocation rules | Not implemented |

The left source defines the join output's observation unit. Right keys must be unique. One-to-one additionally requires unique left keys. Duplicate nonempty keys block the operation, rather than multiplying records. Column collisions must be resolved explicitly. Empty keys never match. Literal strings such as `NA` remain valid keys. Values match exactly, without trimming, case folding, numeric coercion or time conversion at the join stage. Existing axis validation can subsequently reject keys that collide after its own normalization.

The audit reports left/right/output row counts, matched and unmatched left rows, unused right rows, and empty-key counts on both sides. Preview is five rows, while checks cover all rows. Changes invalidate the previous result. No source file is overwritten. Join output and append output remain bounded by 100,000 rows, 2,000,000 cells and 10 MB, checked while constructing output to prevent an oversized replicated result. The existing reader's potential-cell limit also applies after axis mapping.

```text
Two source files
  -> import.mjs: decode full tables, retaining text columns
  -> compose.mjs: exact key checks, explicit join/append, audit
  -> composer.mjs: inspect counts and five-row preview
  -> existing mapping dialog: choose entity, time and measures
  -> importTable: validate panel keys and index the result
  -> table / summary / figures
```

`composeTables(left, right, plan)` is independent of the UI. It returns a new table and audit without changing either source. The browser retains only the current pair of raw inputs in the composer. This is an exploratory two-table prototype, not a persistent workspace. Closing the window loses its inputs and audit. It does not yet export recipes or browse database tables.

## Connection architecture

Extend the current local Node host into a CLI-managed session. Keep connector credentials in the host process or the provider's credential store. The browser receives source handles, column descriptions, bounded data and diagnostics.

```text
CLI: select profile / authenticate / start local session
  -> connector: list tables, describe columns, execute bounded plans
  -> local session API
  -> UI: Sources -> tables -> operation -> keys -> audit -> panel
```

The source abstraction should preserve raw columns and database type metadata separately from the reader's numeric panel representation. Today, a panel discards unselected text variables, so joining already-rendered panels would lose useful categorical and key columns. Remote tables and local files should enter the composer before panel construction.

A minimal connector contract is `listTables`, `describeTable`, `preview`, `validatePlan`, `executePlan` and `cancel`. The UI sends a structured plan with source IDs, column IDs, joins and filters. Dialect-specific compilers quote identifiers obtained from metadata and bind filter values. The database account must enforce read permissions. A string-prefix check such as “starts with SELECT” is not a read-only boundary.

The local host must bind to loopback, validate Origin/Host and use a per-session capability for connector routes. The current static development server is not yet this authenticated connection broker. Neither browser JavaScript nor saved recipes should contain credentials. Host-side errors must redact authentication material. Spawn provider commands with argument arrays and no shell interpolation.

### Databricks

Use the official CLI for OAuth login and named profiles, then reuse unified authentication in the host connector. Query a SQL Warehouse with the Statement Execution API. It exposes execution status, cancellation and result chunks. Preserve its schema and detect truncated responses before declaring an analytical table complete. CLI API calls are suitable for an initial adapter, while an SDK-backed long-lived connector avoids spawning a process for every chunk.

Sources: [CLI authentication](https://docs.databricks.com/aws/en/dev-tools/cli/reference/auth-commands), [CLI API command](https://docs.databricks.com/aws/en/dev-tools/cli/reference/api-commands), [Statement Execution API](https://docs.databricks.com/api/statement-execution/v1/statement-execution).

After installing the official CLI and setting the actual workspace URL, this provider command is real:

```bash
databricks auth login --host "$DATABRICKS_HOST" --profile tableorbit
```

A working profile is insufficient by itself: the integration also needs a warehouse ID and access to the relevant catalog, schema and tables. Reusing a profile can align with existing Databricks developer tools, but no connection to the Databricks VS Code extension has been implemented or tested.

### Microsoft SQL Server and Azure SQL

Use a local driver for structured data and type metadata. The first implementation candidate is Microsoft's `mssql-python`, isolated behind a small host helper. `pyodbc` remains an alternative where an existing ODBC deployment is required. Microsoft's current quickstart supports the new driver on Windows without separate external dependencies, and documents interactive Entra authentication. Authentication choice still depends on the actual server and organization. See [driver quickstart](https://learn.microsoft.com/en-us/sql/connect/python/mssql-python/python-sql-driver-mssql-python-quickstart?view=sql-server-ver17) and [connection strings](https://learn.microsoft.com/en-us/sql/connect/python/mssql-python/connection-strings?view=sql-server-ver17).

`sqlcmd` is useful for connection diagnosis, but its printed output should not become the application's table serialization protocol. Go and ODBC versions differ, and display-width, null, newline and encoding behavior needs care. See [Microsoft sqlcmd documentation](https://learn.microsoft.com/en-us/sql/tools/sqlcmd/sqlcmd-utility?view=sql-server-ver17).

For the installed ODBC sqlcmd, the following is a real diagnostic command for a server that accepts the current Windows identity. It has not been run against a database here:

```bash
sqlcmd -S "$SQL_SERVER" -d "$SQL_DATABASE" -E -N -Q "SELECT 1 AS connection_ok"
```

The app connector should use encrypted connections with certificate validation and an explicit authentication mode. Driver values such as BIGINT and DECIMAL must cross the host/browser boundary as strings with type metadata. Timezone-naive SQL datetimes must remain timezone-naive until the user chooses an interpretation. Neither should silently become a rounded number or UTC instant.

## Large data and cross-source joins

For tables on the same database, push projection, filters, join validation and execution to that database. Only materialize a bounded result for the current reader. Cancel long-running statements, report timeouts and keep preview state distinct from complete-result state.

Do not join independently truncated previews and present their match rates as full-table diagnostics. Audit counts must describe the same filtered population as the executed plan. Ideally validation and execution share a consistent database snapshot where supported. Otherwise disclose that source changes may invalidate the earlier audit.

For a file plus database table, or tables on two servers, first require complete bounded extracts. Server-side staging, federated queries and DuckDB-based local execution can be later capabilities. They introduce permissions, deployment and memory considerations that are not needed for the initial prototype.

Database collations may compare case, accents and trailing spaces differently from the prototype's exact JavaScript strings. A pushed-down plan must expose or reconcile these semantics. A join that passes locally and changes cardinality remotely is a failed validation, not an acceptable backend difference.

## Proposed CLI surface

Only `doctor` exists today:

```bash
node scripts/tableorbit.mjs doctor
```

It checks installed tools and Python driver availability without reading credential profiles or contacting a server. The following interface is a design target, not executable functionality yet:

```text
tableorbit connect databricks --profile <profile> --warehouse <warehouse-id>
tableorbit connect sqlserver --server <server> --database <database> --auth <mode>
tableorbit open <saved-workspace>
```

`connect` should establish a local session, verify access, then open the reader with a Sources entry. The user selects tables and keys in the UI. A saved workspace records source/profile references, selected columns, key mappings, filters and audit metadata, never secrets or an implicit copy of remote data. A versioned recipe can later replay the same operations from the CLI without requiring users to author SQL.

## Validation and next integration gate

Fourteen focused composition/import checks passed. A real Grunfeld split/rejoin reproduced all 220 records and source values. Negative cases cover duplicate keys, composite keys, leading-zero mismatch, empty keys, column collisions, inner-join sample loss and duplicate observations after append. Browser validation confirmed file selection, duplicate-key rejection, a two-column join, audit counts, stale-result invalidation and opening the assembled panel. Both English and Chinese flows were exercised. Native VS Code file selection and composition remain unverified.

Local inspection found Node 24.15.0, Python 3.12.4 and ODBC sqlcmd 16.0.1000.6. Databricks CLI, `mssql-python` and `pyodbc` are not installed in the inspected environment. No installation, login or live database query was performed. CLI connection commands, the session broker, schema browser, remote query compiler and query pushdown remain unimplemented.

Next integration requires an actual Databricks workspace/profile/warehouse or SQL Server address/database/authentication mode, plus permission to install the selected missing dependency. Do not use a production-scale query as the first check. Start with an explicitly selected small table or view and independently verify key uniqueness, counts, Unicode, NULL, BIGINT, DECIMAL and datetime behavior. Kill the pilot if it silently truncates results, leaks credentials into the browser, changes join cardinality, or changes the observation unit.

Before relying on an assembled panel, the user should be able to answer: what does one output row represent, why is the chosen relationship valid, and which unmatched rows were kept or removed? The unresolved risk is semantic correctness across source systems, not whether a join function can execute successfully.

## Local Parquet engine update

The local host now supports DuckDB-backed Parquet metadata, paging, projection and typed filters, with a development CLI `open` command. See [LAZY_FILES.md](LAZY_FILES.md). This does not yet change Combine tables into a lazy join or implement remote database adapters. Full-file panel operations remain future work.
