const { spawn } = require('node:child_process');
const path = require('node:path');
let busy = false;

function renderFigure(spec, pythonPath = process.env.PANEL_SPACE_PYTHON || 'python') {
  if (busy) return Promise.reject(new Error('A figure is already rendering. Please try again shortly.'));
  const input = JSON.stringify(spec);
  if (Buffer.byteLength(input) > 2_000_000) return Promise.reject(new Error('Figure request exceeds 2 MB.'));
  busy = true;
  return new Promise((resolve, reject) => {
    const child = spawn(pythonPath, [path.join(__dirname, 'render_figure.py')], {
      windowsHide:true, stdio:['pipe','pipe','pipe'], env:{...process.env, PYTHONIOENCODING:'utf-8'}
    });
    let stdout = '', stderr = '', settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true; busy = false; clearTimeout(timer);
      if (error) reject(error); else resolve(result);
    };
    const timer = setTimeout(() => { child.kill(); finish(new Error('Figure rendering timed out.')); }, 45000);
    child.on('error', () => finish(new Error('Python could not start. Set PANEL_SPACE_PYTHON or panelSpace.pythonPath to a Python with Matplotlib and Seaborn.')));
    child.stdout.on('data', chunk => {
      stdout += chunk;
      if (stdout.length > 12_000_000) { child.kill(); finish(new Error('Figure output exceeds 12 MB.')); }
    });
    child.stderr.on('data', chunk => { if (stderr.length < 4000) stderr += chunk; });
    child.on('close', code => {
      try {
        const result = JSON.parse(stdout);
        if (code !== 0 || result.error) finish(new Error(result.error || stderr || 'Rendering failed.'));
        else finish(null, result);
      } catch { finish(new Error(stderr || 'Rendering failed. Check Python, Matplotlib and Seaborn.')); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
module.exports = { renderFigure };
