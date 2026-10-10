# Parquet validation

## Persistent queries, 2026-10-10

The same two private sources described below were read through the new agent CLI. No source rows, identifiers, private paths or dataset copies were added to the repository. The implementation keeps Python and DuckDB, reuses the query process, caches bounded key audits/entity pages and computes the three summary quantiles together.

### Paired page comparison

Both paths received the same cached file metadata, selected columns and 100-row request. The fresh path started Python and DuckDB for every query. The persistent path kept the existing connection. Returned rows matched. Three alternating repetitions were run per source, without clearing OS caches.

| Source | Fresh worker seconds, three runs | Persistent worker seconds, three runs | Median before → after |
|---|---|---|---|
| A, 1.24 GB / 221.3 million records | 1.7950, 1.7644, 1.7034 | 0.2741, 0.3186, 0.2794 | 1.764 → 0.279 s |
| B, nine files / 7.49 million records | 1.4827, 1.6149, 1.6233 | 0.0518, 0.0490, 0.0478 | 1.615 → 0.049 s |

These are small local samples, not cold-disk benchmarks or p95 latency estimates. They isolate process reuse without charging metadata rediscovery only to the baseline.

### Direct analysis

| Operation | A seconds | B seconds | A / B sampled process-tree peak MiB |
|---|---:|---:|---:|
| Open: metadata/schema | 1.965 | 1.719 | 183 / 149 |
| One-variable summary | 2.280 | 1.200 | 268 / 211 |
| Grouped figure coordinates | 1.110 | 0.322 | 196 / 159 |
| Initial key audit | Not run | 5.642 | — / 560 |
| First cross-section, including entity enumeration | Not run | 2.518 | — / 457 |
| Time-series slice using the cached entity page | Not run | 0.046 | — / 160 |
| Figure query plus SVG/PDF/PNG rendering | Not run | 2.849 | — / 264 |

Source A's summary and figure query used a single-year filter covering **8,001,760 records**, not all 221 million records. Source B's summary and grouped figure used **all 7,491,446 records**. Independent PyArrow batch reads matched nonmissing counts and means for both selections. No full-file exact summary of A was attempted.

Source A's similarity-record grain was preserved; it was not treated as a unique patent/year panel. B's selected patent/year keys passed uniqueness checks. This does not establish a balanced longitudinal panel: many entities occur only once. The test validates reading sparse keyed records without inventing observations.

Before the small-cache and shared-quantile changes, B's summary took 1.838 s with a sampled process-tree peak of 490 MiB, and its uncached series query took 2.601 s. These are separate individual observations, not a controlled repeated algorithm benchmark. The final results above show why caching repeated entity enumeration is useful; the first audit and first entity page remain visibly slower.

Memory sampling covered Node and its active children at approximately 10 ms intervals. It excludes the browser, VS Code host and independent Arrow oracle, and may miss brief peaks. Windows' Python-worker lifetime peak reached 509 MiB during B's key audit; it is not a per-query reading. The bounded run stopped if the measured tree exceeded 1,500 MiB. DuckDB's 512 MB setting is not a hard RSS cap. The optional benchmark is `tests/lazy_benchmark.py`; it requires existing DuckDB, PyArrow and psutil, accepts source paths/columns as arguments and prints aggregate metrics only.

### Checks and remaining limits

Fifteen focused engine checks passed, including hand-calculated statistics, missing observations versus null values, zero values, duplicate-key rejection, typed dates, exact integer transport and floating-point key display. The worker lifecycle test passed reuse, recoverable errors, cancellation and replacement. A mocked VS Code API test covers the read-only editor and Explorer/CLI command registration. Browser checks exercised the synthetic fixture, direct summaries and rendered figures. Native VSIX installation remains untested.

Accepted for these sources: direct bounded panel reads, complete filtered-source statistics and line/bar figure inputs. Lazy joins, remote connections, arbitrary time-label parsing, full-source statistics on A and browser/extension-host memory are outside this measurement. Initial key audits, exact quantiles on larger selections and deep entity offsets can still exceed the query's memory/time budget.

## Original raw-scan baseline, 2026-10-08

Two existing private research sources were read on the user's Windows laptop. Source files were unchanged. No source rows, IDs, private paths or dataset copies were added to this repository or its example menu.

| Source | On-disk bytes | Records | Files |
|---|---:|---:|---:|
| A, patent similarity records | 1,239,998,806 | 221,334,308 | 1 |
| B, patent regression records | 387,488,259 | 7,491,446 | 9 |

A exceeds both 1 GB and 1 GiB and has 1,802 row groups. These observations retain their original grain: this test does not reinterpret similarity records as unique entity/year panel observations.

## Measurements

DuckDB 1.5.3, Python 3.12 on Windows. Each operation used a new worker, one DuckDB thread, a 512 MB engine memory setting and a 30-second deadline. Three columns were projected. Time filtering requested one year and returned at most 100 records.

| Operation | A seconds | A peak worker MiB | B seconds | B peak worker MiB |
|---|---:|---:|---:|---:|
| Metadata/schema | 1.889 | 137.1 | 1.939 | 98.7 |
| First 100 rows | 1.924 | 175.0 | 1.816 | 104.7 |
| Last 100 rows | 2.152 | 139.2 | 1.778 | 104.8 |
| Selected year | 1.765 | 139.0 | 1.591 | 103.9 |

These are individual runs, including Python startup and result serialization, not repeated statistical estimates. OS caches were not cleared. Memory is the sampled Windows worker peak working set; it excludes Node, the browser and the independent Arrow oracle. Do not generalize these timings to all compression codecs, row-group layouts, column widths or disks. A UI Open currently performs metadata inspection and a first-page query sequentially, so its elapsed time includes both operations.

For B's final page, the footer index selected one of the nine files. It did not scan the preceding eight files' data to find the offset. Within a file, deep OFFSET still depends on the Parquet reader's behavior. Filtering can still scan many row groups when their statistics overlap.

## Correctness checks

`tests/scan_benchmark.py` compares total rows with independent PyArrow footers and the first/last projected rows with bounded Arrow reads. Both sources matched. Returned year values matched the requested year. EXPLAIN contained READ_PARQUET, projected columns and native predicates. Response payloads for the 100-row pages were about 9–11 KB.

The nine-file source also passed the browser host's authenticated API: nine files and 7,491,446 records were reported, the private snapshot stayed on the host, and a year range returned 100 matching records. No private data was extracted into the panel demo.

Ten focused engine tests cover exact IDs/decimals, Unicode/nulls, typed filters, limits, complete extraction, schema mismatch, changed snapshots and nested Hive partitions. The synthetic Hive test preserves `region=001` and verifies `Scanning Files: 1/2` in EXPLAIN. Its temporary files are removed after the test.

## Scope of acceptance

Accepted: lazy raw-table browsing of an actual file larger than 1 GB, selected-column/year queries, coherent multi-file folder paging, and bounded memory on these sources. This does not establish full-file panel rotation, whole-file summary statistics or whole-file figure generation. Those operations still require explicit bounded extraction. No high-cardinality join, remote filesystem, encrypted Parquet or concurrent file mutation benchmark was run.

To repeat against another authorized local source, pass its path and actual column names to `tests/scan_benchmark.py`. That opt-in script requires PyArrow and psutil in addition to DuckDB and prints only aggregate metrics. It is excluded from the extension package.
