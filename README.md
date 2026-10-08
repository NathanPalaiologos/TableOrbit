# TableOrbit

A data viewer for reading tables across entities, time and variables.

This is an early prototype with a browser preview and a VS Code development extension. It is not yet published to the extension marketplace.

A local panel-data reader. The browser preview and VS Code webview share the same interface. English is the default; the language selector offers Chinese and remembers the preference when browser storage is available.

`Quick guide`, below the project name at the top left, explains navigation, selection, statistics, figures and imports. It follows the selected language. Close it with its button or Esc to return to the guide trigger without changing the reading position.

`Dataset` switches immediately between bundled examples and recently imported datasets, without repeating field mapping for examples. `Open file…` goes directly to the file picker; `Paste…` opens the text form. Up to five loaded datasets are retained in memory. Switching datasets resets the reading selection; switching language preserves it. Both languages use the same components and layout.

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

Open `Figure…` and choose `Y / measure` directly from all numeric variables, including hidden table columns. Scatter adds X and `Swap X/Y`. Choose one searchable entity, included entities, or a searchable custom checklist; raw bars/scatter also expose the period. These choices do not change the reading selection or included population. Edit labels and units before drawing; template/size controls are under a collapsible section. Figures do not replace the reader. Rendering runs locally in an existing Python environment with Matplotlib and Seaborn; the browser does not load a plotting framework.

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

The reader needs Node.js 20+; no package install/build step. Figures additionally require an existing Python with Matplotlib and Seaborn. No packages were installed for this iteration.

```bash
node scripts/serve.cjs
```

Open http://127.0.0.1:4317. The server binds to loopback, serves bundled assets, and sends figure JSON to a local Python subprocess only. CSV contents are not sent to a cloud service. To choose a Python interpreter:

```bash
PANEL_SPACE_PYTHON='/path/to/python' node scripts/serve.cjs
```

Replace the path with your existing Python interpreter that has the required libraries. The browser reader still works without Python; only figure rendering needs it. The renderer accepts bounded JSON, runs a fixed script without a shell and handles one figure at a time.

VS Code development host:

```bash
code --new-window --extensionDevelopmentPath="$PWD" "$PWD"
```

Set `panelSpace.pythonPath` in VS Code when Python is not on PATH. Commands: `TableOrbit: Open Grunfeld Demo` and `TableOrbit: Explore Data`. The extension is not published or installed into the normal profile.

The internal `panelSpace` command/configuration identifiers and `PANEL_SPACE_PYTHON` environment variable retain their original spelling for compatibility. The working project name is TableOrbit.

## Data contract and limits

- `Open file…` and `Paste…` accept CSV, TSV, a JSON array of flat records, or JSONL/NDJSON records. JSON null/omitted fields are missing; nested values and booleans are rejected. UTF-8 text only.
- Import explicitly selects a structure: long panel (entity + time), cross-section (unique entity, no time), one time series (time + explicit entity name), or wide time series (time + one column per entity, one named common measure/unit). Duplicate keys are rejected; rotation never aggregates implicitly.
- A cross-section without a unique identifier can explicitly use `Row number (one record per row)`. This identifies source records in order; it does not infer real-world identity or deduplicate equal-valued rows.
- Pure cross-sections hide temporal navigation and disable rotation/time-series plots. They retain aggregation, bar/scatter/histogram plots and table exports. Internally a singleton index is used; no time variable is introduced into the public table, figure metadata or export.
- Wide-series import reshapes selected columns into entity/time records. For example `year,Canada,China` becomes two entities with one explicitly named measure. Do not use this layout when the columns are different variables or units.
- To combine separate files, open the first as `One time series`; open the next with a different entity name and check `Add as new entities to the current panel`. Measure names and time formats must match; users must verify common units. Dates align by their union with no interpolation, resampling or duplicate resolution. Overlapping entity names are rejected. The first panel remains unchanged if validation fails.
- Blank, NA, NaN and null display as Missing; absent entity/time rows display as No record; zero stays zero. Chinese equivalents are available.
- Time format is explicit: numeric/year, YYYY-MM-DD, YYYY-MM, YYYY-Q1, DD/MM/YYYY, MM/DD/YYYY, or an ISO timestamp with seconds and Z/offset (millisecond precision at most). Invalid calendar dates, mixed formats and ambiguous unselected formats are rejected. Numeric epochs are treated as numeric coordinates, not automatically decoded dates. Excel serial dates are not decoded.
- Time keys sort chronologically while labels retain dates/months/quarters. Timezone-aware timestamps normalize to UTC; timezone-naive timestamps and unknown-offset `-00:00` are rejected. Calendar dates have no inferred local timezone. Line figures retain elapsed-time spacing; month/quarter coordinates use the period start. No periods are invented. Entities and variables keep input order.
- Numbers use JavaScript Number; raw-table display adds no rounding, but arbitrary precision and original lexical formatting are not preserved. Summary display is rounded; summary CSV is not.
- CSV export contains one face and identifies its fixed layer/statistic in the filename. Missing and absent values both export as blanks. Formula-like labels are escaped. Source files are never automatically overwritten.
- Guards: 10 MB per file/paste, 100,000 records after reshaping/combining, 2,000,000 potential panel cells. The largest actual stress-tested dataset has 53,940 records; the guards are not tested capacity promises. Figures retain a separate 12,000-position limit. XLSX, Parquet, arbitrary nested JSON, time resampling, overlapping-entity updates, joins, remote SQL/Databricks, editing and persistent saved sessions remain outside this prototype.

## Data flow and validation

```text
CSV / TSV / JSON / JSONL → import.mjs (decode, map, reshape, combine)
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
- Open usability question: whether the confirmed mapping remains comfortable during longer sessions. Open analytical question: whether users understand the changing effective n in unbalanced panels. Neither is answered by passing tests.

## Sample

Grunfeld: 11 firms × 20 years × 3 measures, 220 rows. [CSV source](https://github.com/statsmodels/statsmodels/blob/main/statsmodels/datasets/grunfeld/grunfeld.csv), retrieved 2026-10-07; [dataset documentation](https://www.statsmodels.org/stable/datasets/generated/grunfeld.html). The sample uses the same rendering and analysis path as imported CSVs.

Gapminder: 142 countries × 12 years (1952–2007 in five-year steps), 1,704 rows. Bundled [TSV source](https://github.com/jennybc/gapminder/blob/main/inst/extdata/gapminder.tsv) from Jenny Bryan's teaching package; [documentation](https://jennybc.github.io/gapminder/articles/gapminder.html). `lifeExp` is life expectancy in years, `pop` population, and `gdpPercap` the source GDP-per-capita measure. `continent` remains a source identifier but is not displayed as a numeric variable.

Two bundled derivatives are explicit teaching subsets: `gapminder-2007.json` keeps 2007 rows and removes the constant year; `gapminder-life-expectancy.csv` pivots only Canada, China and United States life expectancy into columns, preserving all 12 source years and values. Examples use saved field mappings through the shared importer; there is no dataset-specific analysis logic.

Diamonds, NLS work and weekly CO₂ are also available in the dataset switcher. Their exact sources, preparation, observation units and validation limits are in [STRESS_TEST.md](STRESS_TEST.md).

## License and third-party material

Original application code is licensed under [MIT](LICENSE). Bundled example data and the unused Three.js files are third-party material, with sources and notices listed in [THIRD_PARTY.md](THIRD_PARTY.md).
