"""Small figure checks: four templates, real render outputs, missing-value input."""
import base64
import io
import json
import re
import sys
from pathlib import Path
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from render_figure import render

output_dir = Path(sys.argv[1])
output_dir.mkdir(parents=True, exist_ok=True)
cases = [('nature','line'),('seaborn','histogram'),('icml','scatter'),('aer','bar')]
for preset, kind in cases:
    spec = {'preset':preset,'size':'single','type':kind,'xlabel':'Year' if kind == 'line' else 'Measure X',
            'ylabel':'Frequency' if kind == 'histogram' else 'Measure Y',
            'series':[{'name':'Series A','points':[{'x':x,'y':y} for x,y in [(1,0),(2,3),(4,None),(8,6)]]}]}
    result = render(spec)
    assert not result['warnings'], result['warnings']
    svg = base64.b64decode(result['files']['svg'])
    assert b'<text' in svg  # editable text, not outlined glyph paths
    pdf = base64.b64decode(result['files']['pdf'])
    assert pdf.startswith(b'%PDF')
    box = re.search(rb'/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)', pdf)
    assert box and abs(float(box[1]) - result['widthMM']/25.4*72) < .01
    png = base64.b64decode(result['files']['png'])
    with Image.open(io.BytesIO(png)) as image:
        assert abs(image.info['dpi'][0] - 600) < 1
        assert abs(image.width - result['widthMM']/25.4*600) < 2
    for ext, data in [('svg',svg),('pdf',pdf),('png',png)]:
        (output_dir / f'{preset}-{kind}.{ext}').write_bytes(data)
    print(preset, kind, result['widthMM'], result['font'], 'PASS')
