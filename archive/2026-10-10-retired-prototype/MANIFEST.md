# Cleanup record: 2026-10-10

Base commit: `2c8eca7cca323a7eba191fa67d2d4b2a364be0cf`.

The current reader does not import `scene.mjs` or Three.js. A source reference check found the Three.js import only in the retired scene module. The extension package already excluded these files.

## Retired prototype

These files were moved within this repository, with their bytes unchanged. Their original relative paths are preserved under this archive folder. The archived `web/` directory is ignored by Git. This keeps the local recovery copy without adding retired runtime files to future commits.

| Original path | Local archive path | Bytes | Classification |
|---|---|---:|---|
| `web/scene.mjs` | `web/scene.mjs` under this folder | 15,776 | Superseded 3D prototype source |
| `web/vendor/three.core.min.js` | `web/vendor/three.core.min.js` under this folder | 381,124 | Dependency used only by the prototype |
| `web/vendor/three.module.min.js` | `web/vendor/three.module.min.js` under this folder | 338,908 | Dependency used only by the prototype |
| `web/vendor/THREE-LICENSE.txt` | `web/vendor/THREE-LICENSE.txt` under this folder | 1,081 | Upstream MIT notice retained with the dependency |

The sources are not regenerated. Restore by copying the local archived files to their original paths. From a later checkout without this ignored archive, recover individual files from the base commit. For example, run this from the repository root:

```bash
git show '2c8eca7cca323a7eba191fa67d2d4b2a364be0cf:web/scene.mjs' > recovered-scene.mjs
```

Choose a new output filename if that recovery file already exists. Restoring the old scene alone will not restore the old application's UI.

## Documentation and test evidence

- `README.before.md` preserves the previous README, including its decision history. It is historical, not installation guidance.
- Technical guides and validation records moved from the root into `docs/`. Their filenames remain unchanged.
- `tests/fixtures/stress-results.json` moved to `docs/stress-results-2026-10-08.json`, with identical bytes. It is evidence from a dated run.
- New stress results go to ignored `tests/output/stress-results.json`. `node tests/stress.mjs` regenerates measurements from retained inputs. Timings can differ.
- `tests/fixtures/real-data-reference.json` remains tracked because the stress test reads it as an independent reference.
- All example data, raw test fixtures and active runtime modules remain in place.

The README and release guide were rewritten for installation and use. The complete pre-edit documents remain recoverable from the base commit. No commit, push or Marketplace publication is part of this cleanup.

## Validation

Check links with `npm run docs:check`, the payload with `npm run package:check`, and the Explorer provider with `node --test tests/extension.test.cjs`. The final cleanup report records their results. Large-data benchmarks are not needed for these path and text changes.
