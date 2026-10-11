# First steps

[Install TableOrbit](INSTALL.md) before you start.

The reader starts empty. Open file reads your data as a record table. Use Choose index only when you want panel views. Open tables switches between files you opened. See [formats and limits](OPEN_FILES.md).

## Try the reader

1. Open Quick guide and choose Grunfeld, or run **TableOrbit: Open Grunfeld Demo** in VS Code.
2. Click a value in the table.
3. Press **Down** to show the next year.
4. Press **Right** to show years as columns.
5. Press **Shift + an arrow key** to move between cells.

The selected cell identifies an entity, a time and a variable. Turning the table keeps that coordinate selected. Arrow keys in a text field or list keep their normal function.

![Time-series table after turning the reading face, with the same observation selected](images/vscode-series.jpg)

Choose **Variables...** to show a searchable column list. Choose **View → Flat table** for one row per observed entity–time pair. In flat mode, arrow keys move between cells.

## Import a text file

1. Right-click a CSV, TSV, JSON, JSONL or NDJSON file in VS Code Explorer.
2. Select **TableOrbit: Explore Data**.
3. Read the original records. No index is required.
4. For panel views, select Choose index and review the suggested entity, time and numeric variables.
5. Select Apply index. Original records returns to all source columns.

For cross-sectional data, select the cross-section structure. No time column is needed. For one time series, give the series an entity name.

Suggestions use column names, values and unique keys. They cannot determine what a record means. See [import detection](IMPORT_DETECTION.md) for ambiguous dates and composite keys.

## Read a large Parquet file

1. Open a Parquet file with TableOrbit.
2. Expand **Columns and time filters**.
3. Select the columns and optional time bounds.
4. Select **Apply**.
5. Choose a panel view if you need entity–time slices.
6. Set the entity and time columns.
7. Select **Apply** again to read the panel.

For repeated events, stay in **Record table**. Use **Find column** to search the checklist. Search keeps your existing selections. If a panel query rejects the keys, choose **Read as records**. See the [event-data check](EVENT_VALIDATION.md) for an example of why this matters.

The Parquet reader queries the source directly. **Extract selection...** copies a bounded selection into the main reader. You do not need extraction for Parquet summaries or line/bar figures.

Folders must contain one dataset with matching column names and types. Reopen a folder after its files change. See [Parquet limits](LAZY_FILES.md#semantics-and-limits).

## Make a statistics table

In the main reader, choose **View → Summary statistics**. Choose the full-period or current-period scope. The selected entities and visible variables determine the result.

In the Parquet reader, choose its summary view. The result covers all filtered records, not just the displayed page.

Select numeric columns first. Leave panel-key validation off for record-level statistics. Enable it only when you need absent entity–time counts and have valid panel keys.

N counts nonmissing values. Missing values and absent entity–time records have separate counts. Statistics use sample standard deviation and interpolated quartiles. Each observed record has equal weight.

## Make a figure

1. Select **Create figure** in the reader you are using.
2. Select the measure and plot type.
3. Select the entities or statistic.
4. Enter axis labels with units.
5. Select a template and width.
6. Select **Draw**.
7. Export SVG, PDF or PNG.

Main-reader figures use imported data. Parquet figures query the filtered source. Presets include Nature, Seaborn paper, ICML and AER styles. Check the final figure against your venue's requirements.

![Figure controls with a rendered Grunfeld time series and export buttons](images/vscode-figure.jpg)

Use the [reader reference](USER_GUIDE.md) for aggregation rules, missing values, time formats and figure limits. Use [table assembly](MULTITABLE_CONNECTIONS.md) to join files or combine time series.
