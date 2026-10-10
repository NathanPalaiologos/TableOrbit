# TableOrbit

A data viewer for reading tables across entities, time and variables.

This is an early prototype with a browser preview and a VS Code development extension. It is not yet published to the extension marketplace.

A local panel-data reader. The browser preview and VS Code webview share the same interface. English is the default; the language selector offers Chinese and remembers the preference when browser storage is available.

`Quick guide`, below the project name at the top left, explains navigation, selection, statistics, figures and imports. It follows the selected language. Close it with its button or Esc to return to the guide trigger without changing the reading position.

`Dataset` switches immediately between three panel examples and recently imported datasets, without repeating field mapping for examples. Grunfeld is the compact default, Gapminder shows country trends, and NLS work shows a larger unbalanced panel. `Open file…` goes directly to the file picker and `Paste…` opens the text form. Up to five loaded datasets are retained in memory. Switching datasets resets the reading selection, while switching language preserves it. Both languages use the same components and layout.

The top toolbar keeps `Dataset`, `Variables` and `Create figure` visible. `Data` contains imports, table assembly and export. `View` contains entity selection, flat tables, summary statistics and aggregation. `Settings` contains language and theme. Both languages use the same layout.

In the browser, choose System, Light or Dark in Settings. The extension follows VS Code's theme colors and fonts. Figures retain a white page for publication. The browser themes have been checked locally; theme changes inside a running VS Code extension host still need testing.

## Large Parquet and agents

`Data → Scan Parquet` opens a local file or dataset folder. Select columns and filters, then choose raw rows, cross-section, time-series or summary statistics. Panel views require explicit entity/time keys. Statistics and the dialog's Create figure query the filtered source directly; paging does not change their scope. Lines and bars export as SVG, PDF or PNG. The existing main reader still works with imported or extracted data.

The scanner reuses a DuckDB worker and sends only bounded results to the interface. On the tested nine-file, 7.49-million-row source, a repeated 100-row query took about 0.05 seconds and a full-source single-variable summary took 1.20 seconds. The initial key audit remained slower. See [validation and limits](PARQUET_VALIDATION.md) and [file-reading details](LAZY_FILES.md).

The extension registers a read-only Parquet editor for File Explorer. Other supported files retain the Explore Data context action. `TableOrbit: Show Agent CLI Command` prints the installed CLI path and configured Python environment. Agents send JSON Lines for inspection, paging, panel slices, statistics and figures through the same engine. See [AGENT_CLI.md](AGENT_CLI.md). Native VSIX installation has not yet been tested.

## Read

- Cross-section: entities × variables. Up/down moves through observed times.
- Time-series: entities × times. Up/down moves through variables in source-column order.
- Left/right rotates 90°. The resting face is an ordinary, front-facing table. Click a value to select its entity/time/variable coordinate; rotation preserves that coordinate.
- `Shift + arrows` moves the selected cell through visible rows/columns and crosses page boundaries. Tab enters/leaves the reader. Dropdowns, text fields and dialogs keep their native keys and focus; Ctrl/Alt/Meta combinations and IME composition are not intercepted.
- Holding left/right does not keep spinning. Held layer/cell movement is rate limited; distinct taps remain responsive. Rotation takes 220 ms and a new navigation action settles an unfinished turn. The footer shows shortcuts only while the reader owns focus.
- Forward/backward layer changes keep the table stationary. A 160 ms edge fade indicates direction; there is no zoom, duplicate table or text fade. Reduced-motion preferences disable the indicator. First/last layers stop without wrapping.
- Row and column headers remain visible while scrolling. The layer dropdown jumps directly. Arrow shortcuts apply only in the reading area.
- `Variables…` opens a searchable checklist. Visible variables control columns, keyboard variable layers, summary rows and table exports; source data are not removed. At least one variable must remain visible.
- Large tables display pages of up to 100 rows × 24 columns. Pagination changes the reading window only. Statistics and export use the complete included population and variable selection. Entity selection shows up to 200 search matches, retaining selections outside the current search.

## Flat table

`View → Flat table` expands the mapped panel into an ordinary table with entity, time and selected variables. Each existing observation occupies one row, in import order. Included entities and visible variables are respected. Missing entity/time combinations are not invented, and aggregation settings are bypassed for the flat display, export and figure context. `Panel view` returns to the prior orientation and retains the selected coordinate. Arrow keys move cells in flat mode. Pages remain bounded and Export table includes every selected observed record.

## Summary table

`Summary statistics` replaces the reading face with a variable-by-statistic table; `Data table` returns to the previous reading orientation. Columns: N, missing values, absent records, mean, sample SD, min, 25%, median, 75%, max. CSV exports full-precision values; screen summaries use seven significant digits for nonintegers.

The default scope is included entities across all observed periods. `Current period` allows period-by-period summaries. Statistics use raw observations and ignore the across-entity aggregation setting. Pooled panel statistics give each observed record equal weight; an entity with more records contributes more. Missing values in existing records and absent entity–time keys have separate counts. SD uses n−1; quartiles use linear interpolation at (N−1)p. No causal or inferential results are implied.

## Aggregate

`Entities…` chooses the included entities. `Across entities` offers raw values, mean, median, sum, minimum, maximum, sample SD and nonmissing count. Aggregation replaces the entity rows with a summary row; both reading faces and figure exports use the same calculations. Selecting Raw values restores individual observations.

- Each statistic is computed independently for one variable at one time across the included entities. No cross-variable or cross-time aggregation occurs.
- Mean is unweighted. Median averages the two middle values for even n. SD uses n−1 and is missing for n < 2.
- Missing/absent values are excluded; all-missing groups remain missing, except nonmissing count = 0. The selection bar reports the effective n and number of included entities. Aggregated CSV exports include each value and its n.
- Changing the included population can change both the value and n over time. These are descriptive summaries, not estimates of causal effects.

## Figures

Choose `Create figure` and choose `Y / measure` directly from all numeric variables, including hidden table columns. Scatter adds X and `Swap X/Y`. Choose one searchable entity, included entities, or a searchable custom checklist; raw bars/scatter also expose the period. These choices do not change the reading selection or included population. Edit labels and units before drawing; template/size controls are under a collapsible section. Figures do not replace the reader. Rendering runs locally in an existing Python environment with Matplotlib and Seaborn; the browser does not load a plotting framework.

| Plot | Raw values | Aggregated values |
|---|---|---|
| Time series | Chosen entity/entities over all observed times | One aggregate per time across included entities |
| Bar chart | Chosen entity/entities at the chosen time; horizontal bars | Aggregate by time; horizontal bars |
| Scatter | Paired X/Y observations for chosen entities at the chosen time | Disabled: return to raw values |
| Histogram | Chosen entity × time observations, pooled over observed times | Distribution of the aggregate values across time |

Scope defaults to the selected entity for time series and included entities when switching to another plot. No implicit fitting, smoothing, confidence intervals or significance tests. Line gaps preserve missing values. Time spacing is numeric, not equally spaced categories. The histogram uses ceil(sqrt(n)) bins, capped at 20. Bar axes include zero. At most 8 raw lines and 40 bars are allowed to limit overcrowding.

PDF and SVG exports are vector-based. PNG is 600 dpi with resolution metadata. SVG retains editable text; PDF embeds TrueType fonts. Exported widths remain exact because rendering does not crop the figure bounding box. Fonts unavailable on another machine trigger a reported fallback. Render warnings are shown rather than concealed.

`Data + settings` exports the plotted coordinates (including n for aggregates), source filename, included entities, time range, missingness policy, labels and rendering settings as JSON. It is a snapshot of the figure input, not a copy of the entire original dataset. Template changes invalidate old export buttons until Draw is clicked again.

### Template sources and limits

These are documented presets, not certification for every Nature journal, CS conference or economics journal. Axis units and descriptive/causal interpretation require the user's judgment. Captions belong in the manuscript, not inside the chart. Inspect the final-size figure for long labels, dense legends and glyph substitutions.

| Preset | Physical widths | Typography / styling | Basis |
|---|---|---|---|
| Nature | 89 / 183 mm | Arial 7 pt; 0.8 pt data lines; colorblind palette | [Nature figure guide](https://research-figure-guide.nature.com/figures/building-and-exporting-figure-panels/) and [final submission](https://www.nature.com/nature/for-authors/final-submission) specify 89/183 mm, 5–7 pt and editable text. Nature's initial-submission page instead uses rounded 90/180 mm; this preset follows final-figure guidance. |
| Seaborn paper | 89 / 178 mm | `ticks`, `paper`, `colorblind`; 8 pt, restrained grid | [Seaborn aesthetics](https://seaborn.pydata.org/tutorial/aesthetics.html). Dimensions and size are this application's choices, not publisher requirements. |
| CS · ICML | 82.55 / 171.45 mm | Times New Roman 8 pt; lines ≥ 0.6 pt; markers plus line styles | [ICML 2026 template](https://media.icml.cc/Conferences/ICML2026/Styles/example_paper.pdf): 6.75 inch text block, 0.25 inch gutter, legible labeled figures and ≥ 0.5 pt lines. The 8 pt font is our preset. The [2026 author instructions](https://icml.cc/Conferences/2026/AuthorInstructions) remove the Type 3 check even though the sample PDF retains older wording; we export embedded TrueType fonts. |
| Economics · AER | 86 / 178 mm | Times New Roman 9 pt; monochrome, distinct markers/line styles | [AER style guide](https://www.aeaweb.org/journals/aer/style-guide) requires vector figures. Width, serif font and monochrome styling are our design choices, not a universal economics standard. |

Sources checked 2026-10-08. Plot height grows with bar count/legend size, capped at 170 mm for bars. Nature line weights are kept within the final-submission guide's 0.25–1 pt range.

## Run

The reader needs Node.js 20+; no package install/build step. Figures require an existing Python with Matplotlib and Seaborn. Parquet scans require DuckDB in that Python environment. No packages were installed for this iteration.

```bash
node scripts/serve.cjs
```

Open http://127.0.0.1:4317. The server binds to loopback, serves bundled assets, and runs figures and Parquet queries in local Python subprocesses. CSV contents are not sent to a cloud service. To choose a Python interpreter:

```bash
PANEL_SPACE_PYTHON='/path/to/python' node scripts/serve.cjs
```

Replace the path with your existing Python interpreter that has the required libraries. The browser reader still works without Python; figure rendering and Parquet scans need it. The renderer accepts bounded JSON, runs a fixed script without a shell and handles one figure at a time.

VS Code development host:

```bash
code --new-window --extensionDevelopmentPath="$PWD" "$PWD"
```

After launching the development host, run a TableOrbit command from the Command Palette. Set `panelSpace.pythonPath` in VS Code when Python is not on PATH. Commands: `TableOrbit: Open Grunfeld Demo` and `TableOrbit: Explore Data`. The extension is not published or installed into the normal profile.

The internal `panelSpace` command/configuration identifiers and `PANEL_SPACE_PYTHON` environment variable retain their original spelling for compatibility. The working project name is TableOrbit.

## Parquet on disk

`Scan Parquet` opens a local file or dataset folder through DuckDB, then pages 100 rows with selected columns, typed filters and optional time bounds. The file is not uploaded or fully loaded into browser memory. `Open selection as panel` explicitly extracts the complete filtered selection within the existing panel limits. Whole-file panel analysis is not yet lazy. See [LAZY_FILES.md](LAZY_FILES.md) for the CLI, data flow and boundaries.

Read-only validation passed on a 1.24 GB, 221-million-row file and a nine-shard, 7.49-million-row dataset. See [PARQUET_VALIDATION.md](PARQUET_VALIDATION.md) for timings, memory and limits. The private sources are not bundled examples.

## Data contract and limits

`Combine tables` joins two local files before axis mapping. Choose left or inner join, key-column pairs, a one-to-one or many-to-one relationship, and the columns to add. Preview reports matched/unmatched rows and the resulting sample size. Append stacks files with the same column names. No duplicate resolution or automatic time conversion occurs. The final panel importer checks entity/time uniqueness again. See [MULTITABLE_CONNECTIONS.md](MULTITABLE_CONNECTIONS.md) for the implemented prototype, validation and the proposed CLI-managed database integration.

`node scripts/tableorbit.mjs doctor` checks local connector prerequisites without reading credentials or connecting to a database. Remote connection commands and database table browsing are not implemented yet.

- `Open file…` and `Paste…` accept CSV, TSV, a JSON array of flat records, or JSONL/NDJSON records. JSON null/omitted fields are missing; nested values and booleans are rejected. UTF-8 text only.
- Import suggests axes from recognized column names, full-column formats and unique keys across all records. A single valid interpretation preselects the structure and fields. Ambiguous dates, competing keys and unsupported encodings remain manual choices. Review the fields and click Open. Supported structures are long panel, cross-section, one time series and wide time series. Duplicate keys are rejected. See [IMPORT_DETECTION.md](IMPORT_DETECTION.md) for rules, types and limitations.
- A cross-section without a unique identifier can explicitly use `Row number (one record per row)`. This identifies source records in order; it does not infer real-world identity or deduplicate equal-valued rows.
- Pure cross-sections hide temporal navigation and disable rotation/time-series plots. They retain aggregation, bar/scatter/histogram plots and table exports. Internally a singleton index is used; no time variable is introduced into the public table, figure metadata or export.
- Wide-series import reshapes selected columns into entity/time records. For example `year,Canada,China` becomes two entities with one explicitly named measure. Do not use this layout when the columns are different variables or units.
- To combine separate files, open the first as `One time series`; open the next with a different entity name and check `Add as new entities to the current panel`. Measure names and time formats must match; users must verify common units. Dates align by their union with no interpolation, resampling or duplicate resolution. Overlapping entity names are rejected. The first panel remains unchanged if validation fails.
- Blank, NA, NaN and null display as Missing; absent entity/time rows display as No record; zero stays zero. Chinese equivalents are available.
- Time format remains editable: numeric/year, YYYY-MM-DD, YYYY-MM, YYYY-Q1, DD/MM/YYYY, MM/DD/YYYY, or an ISO timestamp with seconds and Z/offset (millisecond precision at most). Unambiguous formats can be preselected. Invalid calendar dates, mixed formats and ambiguous unselected formats are rejected. Numeric epochs can be read as numeric coordinates with explicit selection, but are not decoded dates. Excel serial dates are not decoded.
- Time keys sort chronologically while labels retain dates/months/quarters. Timezone-aware timestamps normalize to UTC; timezone-naive timestamps and unknown-offset `-00:00` are rejected. Calendar dates have no inferred local timezone. Line figures retain elapsed-time spacing; month/quarter coordinates use the period start. No periods are invented. Entities and variables keep input order.
- Entity keys keep their text after surrounding whitespace is trimmed, including leading zeros and long integer IDs. JSON numeric tokens are preserved before mapping where the runtime supports source-aware parsing. Older runtimes reject unsafe unquoted integers and ask for quoted IDs. Numeric measures use JavaScript Number and do not retain lexical formatting or arbitrary decimal precision. Integers outside its safe range are unchecked by default and rejected as measures or numeric time keys. Summary display is rounded, while summary CSV exports stored numeric values.
- CSV export contains one face and identifies its fixed layer/statistic in the filename. Missing and absent values both export as blanks. Formula-like labels are escaped. Source files are never automatically overwritten.
- In-memory import guards (not the Parquet source-file limit): 10 MB per file/paste, 100,000 records after reshaping/combining, 2,000,000 potential panel cells. The composer also limits materialized output cells to 2,000,000. The largest actual stress-tested dataset has 53,940 records; the guards are not tested capacity promises. Figures retain a separate 12,000-position limit. XLSX, arbitrary nested JSON, time resampling, overlapping-entity updates, many-to-many or interval joins, remote SQL/Databricks, editing and persistent saved sessions remain outside this prototype.

## Data flow and validation

```text
CSV / TSV / JSON / JSONL → import.mjs (decode without losing ID tokens)
    → detect.mjs (suggest axes) + data.mjs (describe column representations)
    → editable mapping → import.mjs (map, reshape, combine)
    → time.mjs (strict time keys and labels) + data.mjs (validate, index)
    → reader.mjs (coordinates) + analysis.mjs (aggregation, figure data)
    → interaction.mjs (key routing/cell movement) + app.mjs (table/focus)
    → figures.mjs (independent figure controls)
    → local Node host → render_figure.py (Matplotlib/Seaborn) → PDF/SVG/PNG
```

`extension.cjs` supplies the VS Code host bridge; `scripts/serve.cjs` supplies the browser bridge. The old `scene.mjs` and vendored Three.js remain on disk but are unused. There are no new frontend dependencies.

```bash
node --test tests/summary.test.mjs tests/import.test.mjs tests/analysis.test.mjs tests/reader.test.mjs tests/data.test.mjs
node tests/stress.mjs
python tests/figure_check.py /tmp/panel-space-figure-checks
```

The previous iteration passed 25 data/navigation/import/summary checks. This interaction update ran 15 focused checks (four new interaction checks plus existing reader/analysis/summary coverage):

```bash
node --test tests/interaction.test.mjs tests/reader.test.mjs tests/analysis.test.mjs tests/summary.test.mjs
```

New checks cover focus-context/IME/modifier priority, repeat policy, cell movement and independent plot variables. Previous checks cover formats, dates, timestamp normalization, cross-sections, series composition, selected populations, SD denominators, zero/missing/absent values, both faces and figure inputs. Larger real-data checks and an independent pandas oracle are documented in [STRESS_TEST.md](STRESS_TEST.md). The selected input design and current browser validation are in [INTERACTION_DESIGN.md](INTERACTION_DESIGN.md).

Current browser checks cover 53,940-row paging, actual 28,534-row file import, long date-series column paging, variable filtering, summary CSV values, period-specific statistics, entity search selection and English/Chinese layout parity. Earlier checks covered CSV/JSONL composition and dated figures; four earlier renderer checks verified PDF width, editable SVG text and PNG dimensions/DPI. These checks do not establish motion comfort or scientific appropriateness.

The earlier file-picker crash did not recur: the current TSV chooser import completed. Browser and VS Code share the reader, but native VS Code dialogs and new file-context menu formats still need a separate extension-host check.

## Decisions

- 2026-10-08: Rejected the dashboard flow; accepted table-first orthogonal faces with up/down for layer depth and left/right for rotation.
- 2026-10-08: Added explicit across-entity summaries, opt-in publication figures, a local standard plotting backend and English-first localization. The main view remains a table.
- 2026-10-08: User found depth zoom dizzying; replaced it with a stationary table and brief edge feedback. Added explicit time/structure mapping and conservative series composition. No automatic date guessing, imputation or frequency conversion.
- 2026-10-08: Unified bilingual controls, simplified dataset switching, added visible-variable selection and raw-observation summary tables. Replaced repeated full-table rendering and quadratic entity lookup with bounded pages and set indexing; validated with larger real datasets and a pandas oracle.
- 2026-10-08: User confirmed option A: arrows navigate layers/faces, Shift + arrows move cells. Fixed control focus ownership, distinguished held input from separate taps, and made figure variables/entities/time explicit and independent. See [INTERACTION_DESIGN.md](INTERACTION_DESIGN.md).
- 2026-10-08: Replaced decorative dot separators with spaced fields or descriptive labels, and rewrote semicolon-heavy UI copy. Added a bilingual Quick guide at the top left. Working project name: TableOrbit, approved by the user. Earlier naming proposals are superseded.
- 2026-10-08: Added conservative axis suggestions and optional column-type inspection. Only unambiguous formats and unique full-record keys are preselected. This replaces entirely manual initial mapping while retaining user control over observation units, composite keys, date interpretation and numeric conversions. Long JSON IDs are preserved and unsafe integer arithmetic is rejected. See [IMPORT_DETECTION.md](IMPORT_DETECTION.md).
- 2026-10-08: Curated the presentation menu to Grunfeld, Gapminder and NLS work. Other bundled datasets remain intact for import and regression checks. Promoted Create figure with the existing blue accent, moved table export to the table tools, and grouped selection counts with their buttons. No data files, observations or variable definitions changed.
- 2026-10-08: User selected CLI-managed connections with visual table/key selection. Added a local two-table join/append prototype and offline connector diagnostics. Remote adapters and the authenticated session broker are still design work. See [MULTITABLE_CONNECTIONS.md](MULTITABLE_CONNECTIONS.md).
- Open usability question: whether the confirmed mapping remains comfortable during longer sessions. Open analytical question: whether users understand the changing effective n in unbalanced panels. Neither is answered by passing tests.

## Sample

Grunfeld: 11 firms × 20 years × 3 measures, 220 rows. [CSV source](https://github.com/statsmodels/statsmodels/blob/main/statsmodels/datasets/grunfeld/grunfeld.csv), retrieved 2026-10-07; [dataset documentation](https://www.statsmodels.org/stable/datasets/generated/grunfeld.html). The sample uses the same rendering and analysis path as imported CSVs.

Gapminder: 142 countries × 12 years (1952–2007 in five-year steps), 1,704 rows. Bundled [TSV source](https://github.com/jennybc/gapminder/blob/main/inst/extdata/gapminder.tsv) from Jenny Bryan's teaching package; [documentation](https://jennybc.github.io/gapminder/articles/gapminder.html). `lifeExp` is life expectancy in years, `pop` population, and `gdpPercap` the source GDP-per-capita measure. `continent` remains a source identifier but is not displayed as a numeric variable.

Two bundled derivatives are retained as import fixtures outside the presentation menu: `gapminder-2007.json` keeps 2007 rows and removes the constant year; `gapminder-life-expectancy.csv` pivots only Canada, China and United States life expectancy into columns, preserving all 12 source years and values. Examples use saved field mappings through the shared importer; there is no dataset-specific analysis logic.

NLS work remains in the dataset switcher as the unbalanced panel example: 4,711 individuals, 15 observed waves and 28,534 records. Diamonds and weekly CO₂ remain unchanged in `web/data` for cross-section and single-series regression checks, but are no longer presentation choices. Their exact sources, preparation, observation units and validation limits are in [STRESS_TEST.md](STRESS_TEST.md). No files were moved, archived or deleted during this curation.

## License and third-party material

Original application code is licensed under [MIT](LICENSE). Bundled example data and the unused Three.js files are third-party material, with sources and notices listed in [THIRD_PARTY.md](THIRD_PARTY.md).

- 2026-10-08: Added a DuckDB-backed local Parquet scan path with bounded pages, column projection, typed filters and explicit bounded panel extraction. Target: at least 1 GB on disk, pending a large-file benchmark. User deferred large-file generation in favor of small-sample validation. See [LAZY_FILES.md](LAZY_FILES.md).

- 2026-10-08: Validated actual 1 GB+ Parquet reading, added coherent folder snapshots, time ranges, Hive pruning and footer-based shard paging. Added observed-record flat view and a desktop VS Code preview packaging framework. The earlier deferred-capacity status is superseded by [PARQUET_VALIDATION.md](PARQUET_VALIDATION.md). See [RELEASE.md](RELEASE.md) for pending publication steps.
