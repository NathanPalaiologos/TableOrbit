# Import detection

The importer now preselects a plausible entity axis, time axis and structure when one interpretation passes its checks. The fields remain editable and importing still requires Open. This is a deterministic suggestion, not a claim that the application knows the research unit.

## Flow

```text
Source text
  -> parseFile: preserve cell text and JSON number tokens
  -> suggestMapping: recognize names, validate formats, check every key
  -> editable import fields and optional column-type details
  -> importTable / buildPanel: validate the chosen mapping and build the reader
```

`detect.mjs` does not alter rows. Removing it would restore manual axis selection. `columnTypes` in `data.mjs` describes representations and flags unsafe integer magnitudes. The final importer independently checks duplicate keys, values and resource limits, including when a user overrides a suggestion. Removing those checks would allow mappings that lose records or silently round large integer values.

## Common keys

Names are matched without case, spaces, underscores, periods or hyphens where applicable. Recognized suffixes include `_id` and camel-case `Id`. A name creates a candidate, not a decision.

| Family | Examples recognized | Interpretation to verify |
|---|---|---|
| Generic entities | `id`, `entity`, `firm_id`, `patient_id`, `subject`, `uuid`, `guid` | Whether the code is stable across periods |
| Survey respondents | `idcode`, `pid`, `hid`, `hhid`, `persnr`, `household_id` | Person and household are different units |
| Financial identifiers | `gvkey`, `permno`, `permco`, `cusip`, `isin`, `sedol`, `cik`, `figi`, `lei`, `ticker`, `stkcd` | Company, issuer and security IDs are not interchangeable |
| Geography | `country`, `country_code`, `iso3`, `iso3c`, `geoid`, `fips`, `region`, `state` | Preserve leading zeros and verify geographic level |
| Chinese names | `公司代码`, `证券代码`, `股票代码`, `家庭编号`, `受访者编号`, `地区编码` | The name still needs structural validation |
| Time names | `year`, `fyear`, `wave`, `date`, `datadate`, `caldt`, `trddt`, `accper`, `年份`, `交易日期` | Fiscal year, survey wave and calendar date have different meanings |

Financial identifiers can have different scopes and validity over time. A successful key check does not replace a dated identifier crosswalk. See the [WRDS identifier overview](https://wrds-www.wharton.upenn.edu/pages/grid-items/understanding-identifiers-video/) and [CRSP/Compustat guide](https://wrds-www.wharton.upenn.edu/documents/402/CRSP-Compustat_Merged_Database_Data_Guide_9efDcmD.pdf).

All entity keys remain strings after whitespace trimming. `001` is distinct from `1`. UUIDs and existing combined strings such as `US|Retail` can be used intact when their column has a recognized name. Separate columns such as country and industry are not concatenated automatically. A row-level unique ID paired with varying dates is insufficient evidence of a panel. Explicit row number remains available for cross-sections.

## Selection rule

1. Find candidate entity and time columns by name. More than eight candidates of either kind falls back to manual selection to bound work.
2. Validate each proposed time format against every value. A date column with two valid day/month interpretations remains unresolved.
3. Reject automatic entity selection for empty keys or numeric notation such as `1.5`, `1e3` and `0x10`. Such labels may be intentional, but require a manual mapping.
4. For each candidate pair, normalize time and check all entity–time combinations for duplicates. An entity should repeat when time varies. Unbalanced panels are allowed and absent periods stay absent.
5. Preselect only one valid interpretation. Multiple recognized time columns remain manual even if only one is individually unique, because they may be components such as year and month.
6. Without a time candidate, one recognized unique entity can suggest a cross-section. One time column plus one numeric measure can suggest a single series. Multiple measure columns may instead be separate entities, so the structure remains manual.

Example: `revenue,firm_id,date` with rows `1.25,001,2024-01-01`, `2.50,001,2024-02-01` and `3.75,002,2024-01-01` selects `firm_id` and `date`. It retains both entity labels and one absent entity–time record. Adding a duplicate `001,2024-01-01` prevents automatic selection and the final importer rejects that duplicate.

## Time and value formats

| Representation | Current behavior |
|---|---|
| Years and waves | Named time columns with one to four digits can be suggested as numeric coordinates. `68` stays `68`, with no inferred century. |
| Calendar dates | Strict `YYYY-MM-DD`, `YYYY-MM` and `YYYY-Q1` are recognized and validated. |
| Slash dates | `13/01/2024` resolves day/month order. An all-ambiguous column such as `03/04/2024`, `04/05/2024` requires explicit format selection. |
| Timestamps | ISO timestamps with seconds and explicit timezone are normalized to UTC. Equivalent instants are duplicate keys. |
| Encoded time | Compact `20240101`, Excel serials and Unix epochs are not automatically decoded. Use a supported date representation or explicitly retain numeric coordinates. |
| Separate year/month columns | Require preparation into a single supported time column. Automatic composition is not implemented. |
| Integers, decimals, scientific notation | Accepted numeric measures within the current finite-number and safe-integer constraints. Scientific notation in an entity key requires manual mapping. |
| Leading-zero and long integer IDs | Preserved as text keys. Long integer measures are unchecked initially and rejected if selected. |
| 0/1 values and integer codes | Reported as representations. The application cannot infer whether averaging them is meaningful. |
| Percent, currency, grouped or locale-specific numbers | Identified as text representations when recognizable. No automatic stripping of symbols, rescaling or decimal-separator conversion. |
| Missing values | Numeric fields use the existing blank/NA/NaN/null convention. `-999` remains a number. Profile missing counts use this numeric convention even for columns later selected as entity keys. |
| Booleans and mixed text | CSV true/false text is described but not converted to numbers. Native JSON booleans remain unsupported. Mixed columns are not numeric measures. |

Source-aware JSON parsing matters because a number may already be rounded before a conventional reviver sees it. Modern runtimes supply the original token through `context.source`. The importer uses that token, with a rejection fallback for unsafe unquoted integers in older runtimes. See [MDN JSON.parse](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse). Exact decimal arithmetic remains outside this prototype.

## Validation and limits

Focused checks:

```bash
node --test tests/detect.test.mjs tests/import.test.mjs tests/data.test.mjs
```

The 26 checks passed on 2026-10-08. Detection checks include every record in the bundled Grunfeld, Gapminder, NLS work, weekly CO₂ and Gapminder cross-section files, plus synthetic cases for ambiguous dates, composite keys, competing axes, invalid dates, missing keys, UUIDs, financial codes, leading zeros, long IDs and numeric representations. This is regression coverage, not a measured general-purpose classification accuracy.

Browser checks passed for automatic reordered-column mapping, leading-zero IDs, distinct adjacent long JSON IDs, ambiguous-date manual override, explicit row-number cross-sections and Chinese key/type labels. English and Chinese share the same components. No console errors appeared in the checked flows. Native VS Code webview validation remains outstanding.

The biggest uncertainty is semantic correctness on unfamiliar schemas. Unknown names, composite keys, multiple date columns and encoded dates deliberately increase manual work. A false automatic choice on a known observation unit would falsify the rule for that case. The next useful validation is a small set of independently labeled user files, measuring false automatic selections separately from manual fallbacks.

Before relying on a suggestion, be able to explain what one record represents, why its entity–time pair is the right key, and whether each numeric code is a measure or a category. Unique keys alone answer none of those semantic questions.
