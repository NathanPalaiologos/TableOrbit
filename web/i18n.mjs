const words = {
  guide:['Quick guide','使用教程'], arrowKeys:['arrows','方向键'],
  guideReadTitle:['Read the table','阅读表格'],
  guideRead:['Choose a dataset, then click a cell. The selected value and its coordinates appear below the table.','选择数据集，再点击一个单元格。表格下方会显示选中值及其坐标。'],
  guideLayers:['Change the period in cross-section view, or the variable in time-series view.','横截面视图切换时期，时间序列视图切换变量。'],
  guideRotate:['Switch between entities × variables and entities × time. The selected coordinate stays the same.','在“个体 × 变量”和“个体 × 时间”之间转面，保留选中坐标。'],
  guideCells:['Move the selected cell. Crossing an edge opens the next page when one exists.','移动选中的单元格。到达当前页边缘时，自动进入相邻页。'],
  guideFocus:['Click the table or use Tab to enter it. Arrows in a dropdown or text field operate that control. Esc closes this guide.','点击表格或用 Tab 进入后，方向键才控制阅读。在下拉框和输入框中，方向键操作当前控件。按 Esc 关闭教程。'],
  guideCross:['Data without a time column has one cross-section view. Use Shift + arrows to move through its cells.','没有时间列的数据只有横截面视图，使用 Shift 加方向键移动选格。'],
  guideChooseTitle:['Choose what to read','选择阅读范围'],
  guideChoose:['Use Dataset to switch tables, Variables to choose columns, and Entities to choose rows. The layer dropdown jumps to a period or variable.','用“数据集”切换表格，用“选择变量”勾选列，用“选择个体”勾选行。当前层的下拉框可以直接跳转到某个时期或变量。'],
  guideAnalyzeTitle:['Summarize and plot','统计与绘图'],
  guideSummary:['Summary statistics shows N, missingness, mean, SD and quantiles for the chosen variables. Choose all periods or the current period. Across entities instead combines rows at each period using the statistic you select.','“描述统计”显示所选变量的有效 N、缺失情况、均值、标准差和分位数，可选择全部时期或当前时期。“跨个体聚合”则按所选统计量，合并各时期的个体行。'],
  guidePlot:['Open Figure and choose a plot and Y variable. Scatter also offers X and Swap X/Y. Choose entities and, for bars or scatter, a period. Press Draw, then export PDF, SVG or PNG. Plot choices leave the reading selection unchanged.','打开“绘图”，选择图形和 Y 变量。散点图还可以选择 X 并交换 X/Y。选择个体，条形图和散点图还可选择时期。点击“绘制”，再导出 PDF、SVG 或 PNG。绘图选择不会改变表格的阅读位置。'],
  guideImportTitle:['Open your own data','导入自己的数据'],
  guideImport:['Open file accepts CSV, TSV, JSON and JSONL. Choose the data structure, entity and time columns, time format, and numeric variables. For a cross-section, choose no time axis.','“打开文件”支持 CSV、TSV、JSON 和 JSONL。选择数据结构、个体列、时间列、时间格式及数值变量。纯横截面请选择不含时间轴的数据结构。'],
  guideSeries:['To combine time series, open one series first. Import the next with a different entity name and choose Add as new entities. Measures and units must match. Dates align without filling missing values.','合并时间序列时，先打开一个序列，再用不同个体名导入下一个，勾选“作为新个体加入当前面板”。指标和单位须一致。日期按并集对齐，不填补缺失值。'],
  keyLayers:['↑↓ Layers','↑↓ 翻层'], keyRotate:['←→ Rotate','←→ 转面'], keyCells:['Shift + arrows: cells','Shift＋方向键：选格'],
  dataset:['Dataset','数据集'], openFile:['Open file…','打开文件…'], paste:['Paste…','粘贴…'],
  exampleCross:['Gapminder (2007 snapshot)','Gapminder（2007 横截面）'], exampleWide:['Life expectancy (3 countries)','预期寿命（三国面板）'],
  exampleDiamonds:['Diamonds (53,940 rows)','钻石（53,940 行）'], exampleNls:['NLS work (28,534 rows)','NLS 劳动面板（28,534 行）'], exampleCo2:['CO₂ (weekly series)','CO₂（周度序列）'],
  chooseVariables:['Variables…','选择变量…'], needVariable:['Select at least one variable.','请至少选择一个变量。'], search:['Search','搜索'],
  summary:['Summary statistics','描述统计'], dataView:['Data table','数据表'], summaryScope:['Statistics over','统计范围'], allPeriods:['All periods','全部时期'], currentPeriod:['Current period','当前时期'],
  summaryNote:['Raw observations in the selected scope, not pre-aggregated values. SD: n−1. Quartiles: linear interpolation. Missing and absent records are counted separately. Pagination does not restrict statistics.','对所选范围内的原始观测统计，不使用聚合后的数值。标准差分母为 n−1，分位数线性插值。缺失值与无记录单独计数，分页不限制统计范围。'],
  n:['N','有效 N'], q25:['25%','25%'], q75:['75%','75%'], entity:['Entity','个体'], rowNumber:['Row number','行号'], rowIdOption:['Row number (one record per row)','行号（每行一条记录）'],
  columns:['Columns','列'], previousRows:['Previous rows','上一页行'], nextRows:['Next rows','下一页行'], previousColumns:['Previous columns','上一页列'], nextColumns:['Next columns','下一页列'],
  showing:['Showing','显示'], selectedCount:['selected','已选'], loading:['Loading…','加载中…'],
  timestampFormat:['ISO timestamp (Z / ±HH:MM)','ISO 时间戳（Z / ±HH:MM）'], measureExample:['e.g. temperature (°C)','例如：温度 (°C)'],
  seabornTemplate:['Seaborn paper','Seaborn 论文'], csTemplate:['ICML','ICML'], econTemplate:['AER','AER'],
  demo:['Example','示例'], openCSV:['Open data…','打开数据…'], exportFace:['Export table','导出表格'],
  chooseFile:['Choose file…','选择文件…'], pasteHint:['Or paste a small table below.','也可以在下方粘贴小表格。'], format:['Format','文件格式'], pasteData:['Data to import','待导入数据'], nextStep:['Next','下一步'],
  structure:['Structure','数据结构'], panelMode:['Panel (long)','长面板'], seriesMode:['One time series','单个时间序列'], wideMode:['Time series → panel','时间序列 → 面板'],
  timeFormat:['Time format','时间格式'], numericTime:['Numeric / year','数值 / 年份'], entityName:['Entity name','个体名称'], measureName:['Common measure / unit','共同指标 / 单位'],
  seriesColumns:['Entity columns (one common measure)','个体列（同一指标）'],
  wideNote:['Each selected column becomes an entity. All columns must measure the same quantity and unit. Missing values stay missing.','每个所选列成为一个个体，各列必须是同一指标、同一单位。缺失保持缺失。'],
  crossNote:['One row per entity. No time axis is created.','每行一个个体，不创建时间轴。'],
  panelNote:['One row per entity and time. Duplicate keys are rejected. Missing periods are not filled.','每行一个个体和时期。拒绝重复键，不填补缺失时期。'],
  seriesNote:['One row per time, assigned to the entity name below.','每行一个时期，归属所填个体名称。'],
  timePreview:['Time preview','时间预览'],
  appendSeries:['Add as new entities to the current panel','作为新个体加入当前面板'],
  appendNote:['Use identical measure names, units and time format. Dates are aligned by their union, with no filling or resampling.','需使用相同指标名称、单位和时间格式。按日期并集对齐，不填补或重采样。'],
  figure:['Figure…','绘图…'], language:['Language','语言'], navigation:['Reading navigation','阅读导航'],
  left:['Rotate left','向左旋转'], right:['Rotate right','向右旋转'], previous:['Previous layer','上一层'], next:['Next layer','下一层'],
  layer:['Current layer','当前层'], cross:['Cross-section','横截面'], series:['Time-series','时间序列'], variables:['Variables','变量'],
  reader:['Data reader: arrows navigate, Shift + arrows move the selected cell','数据阅读区：方向键翻层或转面，Shift 加方向键移动选格'],
  keys:['↑↓ Layers, ←→ Rotate, Shift + arrows: cells','↑↓ 翻层，←→ 转面，Shift＋方向键：选格'],
  activateReader:['Click or Tab into the table to use navigation keys','点击表格或用 Tab 进入后，可使用阅读快捷键'],
  crossKeys:['Cross-section, Shift + arrows: cells','横截面，Shift＋方向键：选格'],
  yVariable:['Y / measure','Y / 指标'],swapAxes:['Swap X/Y','交换 X/Y'],oneEntity:['One entity','单个个体'],customEntities:['Choose entities…','自选个体…'],figureStyle:['Style and size','样式与尺寸'],
  fields:['Data fields','数据字段'], entityColumn:['Entity column','个体列'], timeColumn:['Time column','时间列'],
  numeric:['Numeric variables','数值变量'], cancel:['Cancel','取消'], open:['Open','打开'], close:['Close','关闭'],
  none:['Raw values','原始值'], mean:['Mean','均值'], median:['Median','中位数'], sum:['Sum','总和'], min:['Minimum','最小值'],
  max:['Maximum','最大值'], sd:['Sample SD','样本标准差'], count:['Count (nonmissing)','非缺失计数'],
  aggregation:['Across entities','跨个体聚合'], scope:['Entities…','选择个体…'], all:['All','全选'], clear:['Clear','清空'], apply:['Apply','应用'],
  missing:['Missing','缺失'], absent:['No record','无记录'], records:['records','记录'], entities:['entities','个体'], periods:['periods','时期'],
  aggregateNote:['Across included entities, excluding missing values. Select a cell to see n. SD uses n−1.','对所选个体聚合，排除缺失值。选格显示 n，标准差分母为 n−1。'],
  needEntity:['Include at least one entity.','请至少选择一个个体。'], saved:['Saved.','已保存。'],
  noNumeric:['No numeric variables available.','没有可用的数值变量。'], tooLarge:['File limit: 10 MB.','文件上限为 10 MB。'],
  figureTitle:['Figure','绘图'], kind:['Plot','图形'], line:['Time series','时间序列'], bar:['Bar chart','条形图'], scatter:['Scatter','散点图'], histogram:['Histogram','直方图'],
  template:['Template','模板'], size:['Width','宽度'], single:['Single column','单栏'], double:['Double column','双栏'],
  seriesScope:['Series','序列范围'], selected:['Selected entity','当前个体'], included:['Included entities','所选个体'],
  xVariable:['X variable','X 变量'], xLabel:['X label / unit','X 标签 / 单位'], yLabel:['Y label / unit','Y 标签 / 单位'],
  draw:['Draw','绘制'], drawing:['Rendering…','正在绘图…'], downloadSVG:['SVG','SVG'], downloadPDF:['PDF','PDF'], downloadPNG:['PNG (600 dpi)','PNG (600 dpi)'],
  recipe:['Data + settings','数据与设置'], figureEmpty:['Choose a plot and draw.','选择图形后绘制。'],
  templateNote:['Venue-based presets, not submission certification. Check labels, units and final-size legibility.','模板参考出版规范。投稿前仍需检查标签、单位和最终尺寸下的可读性。'],
  outdated:['Settings changed — draw to update the figure.','设置已变更，请重新绘制。'], rawScatter:['Scatter uses raw paired observations at the current time.','散点图使用当前时期的原始配对观测。'],
  rowCount:['rows','行'], emptyFigure:['No observed values in this selection.','当前选择中没有可绘制的数值。'],
};
let language = 'en';
export const getLanguage = () => language;
export function textFields(element, values) {
  element.classList.add('text-fields');
  element.replaceChildren(...values.map(value => {
    const span = document.createElement('span');
    span.textContent = value;
    return span;
  }));
}
export function setLanguage(value) { language = value === 'zh' ? 'zh' : 'en'; }
export function t(key) { return words[key]?.[language === 'zh' ? 1 : 0] ?? key; }
export function translateDOM(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder)); });
}
export function errorText(error) {
  const message = error.message ?? String(error);
  if (language === 'zh') {
    const chartErrors = {
      'Choose a Y variable from this dataset.':'请从当前数据集选择 Y 变量。',
      'Choose an X variable from this dataset.':'请从当前数据集选择 X 变量。',
      'Choose an included entity from the list.':'请从列表选择一个已包含的个体。',
      'Choose at least one entity for this figure.':'请至少选择一个绘图个体。',
      'File limit: 10 MB.':'文件上限为 10 MB。', 'Limit: 100,000 records.':'最多支持 100,000 条记录。',
      'Panel exceeds 2,000,000 cells.':'面板超过 2,000,000 格。', 'Expected 1–100,000 JSON records.':'JSON 应包含 1–100,000 条记录。',
      'Combined panel exceeds 100,000 records or 2,000,000 cells.':'合并后超过 100,000 条记录或 2,000,000 格。',
      'Figure exceeds 12,000 positions. Select fewer entities or aggregate.':'图形超过 12,000 个位置，请减少个体或使用聚合。',
      'Invalid calendar date.':'无效的日历日期。',
      'Each JSON record must be an object.':'每条 JSON 记录必须是对象。',
      'Supported formats: CSV, TSV, JSON, JSONL, NDJSON.':'支持 CSV、TSV、JSON、JSONL、NDJSON。',
      'Column names cannot be empty.':'列名不能为空。',
      'Name the common measure and its unit.':'请填写共同指标及其单位。',
      'Name this time series entity.':'请填写该时间序列的个体名称。',
      'Choose a time column and separate numeric columns.':'请选择时间列及独立的数值列。',
      'Use the same time format for both datasets. No automatic resampling.':'两个数据集需使用相同时间格式，不自动重采样。',
      'Series must have the same measure names and units.':'序列的指标名称与单位必须一致。',
      'An entity with that name already exists. Choose distinct entity names.':'个体名称已存在，请使用不同名称。',
      'Combining series requires a time axis in both datasets.':'合并序列要求两个数据集均有时间轴。',
      'Could not load example data.':'无法加载示例数据。',
      'Cross-sectional data has no time axis. Choose a bar chart, scatter or histogram.':'横截面没有时间轴，请选择条形图、散点图或直方图。',
      'No observed values in this selection.':'当前选择中没有可绘制的数值。',
      'Scatter requires raw observations.':'散点图需要原始观测，请先取消聚合。',
      'Select at most 8 entities for a line chart, or use an aggregation.':'折线图最多选择 8 个个体，或改用聚合。',
      'Select at most 40 bars.':'条形图最多支持 40 个类别。',
      'Numeric overflow in aggregation':'聚合结果超出数值范围。',
      'Figure rendering timed out.':'绘图超时。',
      'Figure request timed out.':'绘图请求超时。',
      'A figure is already rendering. Please try again shortly.':'已有图形正在绘制，请稍后重试。',
    };
    if (message.startsWith('Invalid ') && message.includes(' time: ')) return '时间格式不匹配：' + message.split(' time: ')[1];
    if (message.startsWith('Nested objects, arrays and booleans are unsupported: ')) return '暂不支持嵌套对象、数组和布尔值：' + message.split(': ')[1];
    if (error instanceof SyntaxError) return 'JSON 格式错误，请检查引号、逗号及括号。';
    return chartErrors[message] ?? message;
  }
  const translations = [
    ['第一版支持 2 MB 以内的 CSV。请先导出较小的面板。','CSV limit: 2 MB.'],
    ['CSV 引号格式不正确。','Invalid CSV quoting.'], ['CSV 引号后应为分隔符或换行。','Expected a delimiter or newline after a quoted field.'],
    ['CSV 中有未闭合的引号。','Unclosed CSV quote.'], ['CSV 需要表头和至少一行数据。','CSV needs headers and at least one data row.'],
    ['列名不能为空或重复。','Column names must be nonempty and unique.'], ['CSV 各行的列数不一致。','CSV rows have inconsistent field counts.'],
    ['第一版最多读取 5,000 行。','Limit: 5,000 rows.'], ['请选择不同的个体列和时间列。','Choose different entity and time columns.'],
    ['选择的列不在 CSV 中。','Selected columns are not in the CSV.'], ['请至少选择一个独立的数值变量。','Select at least one separate numeric variable.'],
    ['个体和时间键不能缺失。','Entity and time keys cannot be missing.'], ['第一版时间列须为数值（例如 1935、1936），暂不解析日期字符串。','Time must be numeric, such as 1935 or 1936. Date strings are not yet supported.'],
    ['三维网格超过 12,000 格。请减少个体、年份或变量后重试。','Panel exceeds 12,000 cells. Reduce entities, times or variables.'],
  ];
  if (message.startsWith('重复面板键：')) return 'Duplicate entity/time key: ' + message.split('：')[1].split('。')[0] + '. No automatic aggregation.';
  if (message.includes('包含非数值：')) return 'Nonnumeric measure: ' + message.replace('包含非数值：', ': ');
  return translations.find(pair => pair[0] === message)?.[1] ?? message;
}
