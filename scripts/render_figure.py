"""Local publication-figure renderer. JSON in; base64 artifacts out. No network IO."""
import base64
import io
import json
import math
import sys
import warnings

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.ticker import MaxNLocator, ScalarFormatter
from datetime import datetime, timedelta, timezone
from matplotlib.dates import AutoDateLocator, ConciseDateFormatter

PRESETS = {
    'nature': {'widths': [89, 183], 'font': 'Arial', 'size': 7, 'line': 0.8},
    'seaborn': {'widths': [89, 178], 'font': 'Arial', 'size': 8, 'line': 1},
    'icml': {'widths': [82.55, 171.45], 'font': 'Times New Roman', 'size': 8, 'line': 0.9},
    'aer': {'widths': [86, 178], 'font': 'Times New Roman', 'size': 9, 'line': 1},
}
COLORS = ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#000000', '#E69F00', '#56B4E9', '#777777']
MARKERS = ['o', 's', '^', 'D', 'v', 'P', 'X', '*']
STYLES = ['-', '--', '-.', ':']


def validate(spec):
    if spec.get('preset') not in PRESETS or spec.get('type') not in ('line', 'bar', 'scatter', 'histogram'):
        raise ValueError('Unknown figure type or template.')
    if spec.get('size') not in ('single', 'double'):
        raise ValueError('Unknown figure size.')
    series = spec.get('series', [])
    points = [p for s in series for p in s['points']]
    if not points or len(points) > 12000:
        raise ValueError('Expected 1–12,000 plotted positions.')
    if spec['type'] == 'line' and len(series) > 8:
        raise ValueError('At most 8 lines per figure.')
    if spec['type'] == 'bar' and len(points) > 40:
        raise ValueError('At most 40 bars per figure.')
    for p in points:
        for key in ('x', 'y'):
            value = p[key]
            if key == 'x' and spec['type'] == 'bar' and isinstance(value, str):
                continue
            if value is not None and (not isinstance(value, (int, float)) or not math.isfinite(value)):
                raise ValueError('Figure data must be finite numeric values or null.')
    for key in ('xlabel', 'ylabel'):
        if not isinstance(spec.get(key), str) or not spec[key].strip() or len(spec[key]) > 160:
            raise ValueError('Provide axis labels of 1–160 characters, including units where applicable.')
    return points


def render(spec):
    points = validate(spec)
    preset = PRESETS[spec['preset']]
    width = preset['widths'][spec['size'] == 'double']
    height = min(120, max(64, width * .68))
    if spec['type'] == 'bar':
        height = min(170, max(height, 25 + 3.6 * len(points)))
    if spec['type'] == 'line':
        legend_rows = math.ceil(len(spec['series']) / (1 if width < 100 else 2))
        height = max(height, 45 + 4.5 * legend_rows)
    notes = []
    colors = COLORS
    plt.rcdefaults()
    if spec['preset'] == 'seaborn':
        import seaborn as sns
        sns.set_theme(style='ticks', context='paper', palette='colorblind')
        colors = sns.color_palette('colorblind').as_hex()
    font = preset['font']
    try:
        font_manager.findfont(font, fallback_to_default=False)
    except ValueError:
        font = 'DejaVu Sans' if font == 'Arial' else 'DejaVu Serif'
        notes.append(f'{preset["font"]} unavailable; substituted {font}.')
    # Literal field names: dollar signs and underscores must not become math markup.
    plt.rcParams.update({
        'font.family': [font, 'Microsoft YaHei', 'DejaVu Sans'], 'font.size': preset['size'], 'text.parse_math': False,
        'axes.labelsize': preset['size'], 'xtick.labelsize': preset['size'],
        'ytick.labelsize': preset['size'], 'legend.fontsize': preset['size'],
        'axes.linewidth': .6, 'lines.linewidth': preset['line'], 'lines.markersize': 2.6,
        'axes.spines.top': False, 'axes.spines.right': False,
        'axes.facecolor': 'white', 'figure.facecolor': 'white',
        'pdf.fonttype': 42, 'ps.fonttype': 42, 'svg.fonttype': 'none',
        'axes.unicode_minus': False, 'savefig.facecolor': 'white',
    })
    fig, ax = plt.subplots(figsize=(width / 25.4, height / 25.4), layout='constrained')
    kind = spec['type']
    monochrome = spec['preset'] == 'aer'
    if kind == 'line':
        for i, series in enumerate(spec['series']):
            calendar_time = spec.get('timeFormat') not in (None, 'number')
            # Timedelta also supports pre-1970 dates on Windows.
            x = [datetime(1970, 1, 1, tzinfo=timezone.utc) + timedelta(milliseconds=p['x']) if calendar_time else p['x'] for p in series['points']]
            y = [math.nan if p['y'] is None else p['y'] for p in series['points']]
            ax.plot(x, y, label=series['name'], color='black' if monochrome else colors[i % len(colors)],
                    marker=MARKERS[i % len(MARKERS)], linestyle=STYLES[i % len(STYLES)],
                    markevery=max(1, len(x)//12))
        # A legend below the axes avoids hiding any observations.
        ax.legend(loc='upper center', bbox_to_anchor=(.5, -.23), frameon=False,
                  ncol=1 if width < 100 else 2)
        if calendar_time:
            locator = AutoDateLocator(minticks=3, maxticks=5)
            ax.xaxis.set_major_locator(locator)
            ax.xaxis.set_major_formatter(ConciseDateFormatter(locator, tz=timezone.utc))
        else:
            ax.xaxis.set_major_locator(MaxNLocator(nbins=5))
    elif kind == 'bar':
        observed = [p for p in points if p['y'] is not None]
        labels = [str(p['x']) for p in observed]
        ax.barh(range(len(observed)), [p['y'] for p in observed], color='#555555' if monochrome else colors[0], height=.65)
        ax.set_yticks(range(len(observed)), labels)
        ax.invert_yaxis()
        # Horizontal bars preserve long entity names. Values always include zero.
        ax.set_xlim(min(0, min(p['y'] for p in observed)), max(0, max(p['y'] for p in observed)) or 1)
        spec = {**spec, 'xlabel':spec['ylabel'], 'ylabel':spec['xlabel']}
    elif kind == 'scatter':
        observed = [p for p in points if p['x'] is not None and p['y'] is not None]
        ax.scatter([p['x'] for p in observed], [p['y'] for p in observed], s=12,
                   color='black' if monochrome else colors[0], linewidths=.4, edgecolors='white')
    else:
        observed = [p['y'] for p in points if p['y'] is not None]
        ax.hist(observed, bins=min(20, max(1, math.ceil(math.sqrt(len(observed))))),
                color='#555555' if monochrome else colors[0], edgecolor='white', linewidth=.6)
        ax.yaxis.set_major_locator(MaxNLocator(integer=True))
    ax.set_xlabel(spec['xlabel'])
    ax.set_ylabel(spec['ylabel'])
    ax.tick_params(direction='out', length=3, width=.6)
    for axis in (ax.xaxis, ax.yaxis):
        if isinstance(axis.get_major_formatter(), ScalarFormatter):
            axis.get_major_formatter().set_useOffset(False)
    if spec['preset'] == 'seaborn':
        ax.grid(axis='y' if kind != 'bar' else 'x', color='.88', linewidth=.5)
        ax.set_axisbelow(True)
    if kind == 'bar' and len(points) > 12 and width < 100:
        notes.append('More than 12 bars at single-column size: use a wider figure or fewer entities.')
    artifacts = {}
    with warnings.catch_warnings(record=True) as captured:
        warnings.simplefilter('always')
        for extension in ('svg', 'pdf', 'png'):
            output = io.BytesIO()
            # Do not use bbox_inches=tight: it changes the promised physical size.
            fig.savefig(output, format=extension, dpi=600)
            artifacts[extension] = base64.b64encode(output.getvalue()).decode('ascii')
        notes.extend(sorted({str(w.message) for w in captured}))
    plt.close(fig)
    return {'files':artifacts, 'widthMM':width, 'heightMM':height, 'font':font, 'matplotlib':matplotlib.__version__,
            'fontPT':preset['size'], 'dpi':600, 'warnings':notes}


if __name__ == '__main__':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        spec = json.loads(sys.stdin.buffer.read(2_000_001).decode('utf-8-sig'))
        print(json.dumps(render(spec), ensure_ascii=True))
    except Exception as error:
        print(json.dumps({'error':str(error)}))
        sys.exit(1)
