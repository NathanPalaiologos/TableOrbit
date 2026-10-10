# Real-data checks — 2026-10-08

This run tests a local exploratory reader, not an analytical finding. No packages were installed. The datasets are not expanded or duplicated to simulate size.

## Sources and observation units

| Dataset | Source and preparation | Observation |
|---|---|---|
| Diamonds | [Seaborn's CSV](https://github.com/mwaskom/seaborn-data/blob/master/diamonds.csv), preserved verbatim. Seven numeric fields displayed; categorical cut/color/clarity stay in the source. | One source row per diamond record. A displayed row number identifies the record; equal-valued rows are not deduplicated. |
| NLS work | [Stata Press release 18](https://www.stata-press.com/data/r18/u.html), `nlswork.dta`; retained in `tests/fixtures`. Converted with pandas `read_stata(convert_categoricals=False)` then `to_csv(index=False)`, with all rows and 21 columns preserved. | `idcode × year`. Year codes 68–88 remain as supplied, covering 15 observed survey waves. No missing waves or rows filled. |
| Mauna Loa CO₂ | [Statsmodels CSV](https://github.com/statsmodels/statsmodels/blob/main/statsmodels/datasets/co2/co2.csv). Converted only the YYYYMMDD date strings to YYYY-MM-DD. All 2,284 positions retained, including blanks. | One weekly position for the Mauna Loa series. |

Stata documentation datasets are teaching copies; the publisher notes that some are altered. This copy is for software validation, not substantive labor-market research. Numeric category codes (such as race/industry) remain numeric: the viewer does not decide whether means or quantiles are meaningful for them. Variable selection is explicit.

## Results

| Dataset | Records | Entities | Periods | Numeric variables | Missing cells in existing records | Absent entity–period records | Import | Summary |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Diamonds | 53,940 | 53,940 | 1 | 7 | 0 | 0 | 708 ms | 277 ms |
| NLS work | 28,534 | 4,711 | 15 | 19 | 16,747 | 42,131 | 674 ms | 256 ms |
| CO₂ | 2,284 | 1 | 2,284 | 1 | 59 | 0 | 27 ms | 1 ms |

Node v24.15.0 on this Windows machine. Import timing includes decoding, numeric-column detection and panel indexing; summary timing includes selected-population construction and all displayed statistics. Timings are one bounded local run, not browser interaction latency or a cross-machine benchmark. Observed process heap after each dataset was 137 / 189 / 197 MB, cumulative and subject to garbage collection, not peak memory. Original run: [stress-results-2026-10-08.json](stress-results-2026-10-08.json). New runs write `tests/output/stress-results.json`, which Git ignores.

`tests/reference_stats.py` independently calculates N, missingness, absent records, mean, sample SD, min/max and linearly interpolated quartiles using pandas. All 27 numeric variables across these datasets matched the JavaScript statistics at relative/absolute tolerance 1e-9. Input SHA-256 hashes are recorded in `tests/fixtures/real-data-reference.json`; a changed source invalidates the comparison.

Additional checks:

- Unique panel keys and actual row/entity/time counts; duplicate keys rejected for NLS and CO₂.
- JSON and JSONL decoding parity on the first 100 actual source rows per dataset.
- Zero vs missing cell vs absent record; all-missing groups; one-value SD; explicit period/individual scope; type-7 quartiles.
- Variable visibility across both faces, keyboard layer navigation and bounded first/last page calculations.
- Browser: 53,940-row Diamonds uses 100 displayed rows / 700 cells while summary N remains 53,940; next page selects record 101.
- Browser: CO₂ time-series face displays 24 time columns per page, next page begins 1958-09-13, and summary has N=2,225 plus 59 missing. Returning from summary restores the time-series face.
- Browser: actual 2.8 MB NLS CSV file-picker import, variable subset, rejecting an empty variable subset, current-period statistics updating on a layer change, and two selected individuals retained across list searches.
- Browser: downloaded summary CSV contains only the two selected variables; every statistic and unrounded value matched the pandas oracle.
- Browser: English/Chinese toolbar, navigation, analysis row and reader geometry matched at 746 px viewport width after fixing label wrapping. Data values and selection survived the language switch. No captured console errors/warnings in these interactions.

## Statistical contract

Summary rows are selected numeric variables; the population is included entities and either all observed periods (default) or the current period. Computation uses original records, ignoring the across-entity aggregation dropdown. Pooled panel summaries weight observations equally, so individuals with more observations contribute more. They are not equally weighted individual summaries or causal estimates.

N counts nonmissing values. Missing counts null values in existing records. No record counts absent keys in the selected entity × observed-period grid, separately for each variable; it does not invent calendar periods. Sample SD uses n−1 and is missing at N<2. Quantiles use linear interpolation at (N−1)p. The screen shows seven significant digits for nonintegers; CSV retains full JavaScript numeric precision.

## Boundaries

The data limit is 10 MB / 100,000 records / 2,000,000 potential panel cells. These are guards, not verified capacity promises. The largest actual dataset tested is 53,940 records. Table pages are at most 100 rows × 24 columns, and at most five datasets are retained in the switcher cache. Statistics and table exports operate on the complete selection, not the visible page. Entity selection renders at most 200 search matches without discarding other selections.

Native VS Code dialogs were not exercised this turn; the shared browser logic was. Figure inputs retain the separate 12,000-position bound, with an explicit message to reduce the selection or aggregate. At the time of this run, large-file Parquet reading and native installation had not been tested. See the later [Parquet tests](PARQUET_VALIDATION.md) and [VSIX test](VSIX_LOCAL_TEST.md). XLSX, native categorical summaries and cross-device performance remain outside these checks.

## Reproduce

Use an existing Python environment with pandas; no installation is performed by these scripts.

```bash
python tests/reference_stats.py
node --test tests/summary.test.mjs tests/reader.test.mjs tests/analysis.test.mjs tests/data.test.mjs tests/import.test.mjs
node tests/stress.mjs
```

Regenerate the reference only when intentionally accepting a source change, then review its counts and hashes. Passing numerical checks does not establish that a variable's coding, unit or intended interpretation is suitable for a particular analysis.
