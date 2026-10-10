# Third-party material

The root MIT license covers original TableOrbit code. It does not relicense the example datasets or vendored third-party code. Retain upstream notices and consult each source's terms when reusing its material.

| Files | Source and notes |
|---|---|
| `web/data/grunfeld.csv` | [Statsmodels Grunfeld dataset](https://github.com/statsmodels/statsmodels/tree/main/statsmodels/datasets/grunfeld). See the [sample descriptions](docs/USER_GUIDE.md#sample) for observation units. |
| `web/data/co2.csv` | [Statsmodels CO₂ dataset](https://github.com/statsmodels/statsmodels/tree/main/statsmodels/datasets/co2). Dates were reformatted without changing observations. |
| `web/data/gapminder.tsv`, `gapminder-2007.json`, `gapminder-life-expectancy.csv` | [Jenny Bryan's Gapminder teaching dataset](https://github.com/jennybc/gapminder). The JSON snapshot and three-country wide CSV are documented derivatives. |
| `web/data/diamonds.csv` | [Seaborn example datasets](https://github.com/mwaskom/seaborn-data), originally the ggplot2 diamonds example. Preserved verbatim. |
| `web/data/nlswork.csv`, `tests/fixtures/nlswork.dta` | [Stata Press documentation data](https://www.stata-press.com/data/r18/u.html). The CSV is a conversion of the teaching dataset. See [data checks](docs/STRESS_TEST.md) for preparation and interpretation limits. |
| Retired Three.js prototype | Three.js was used only by the retired scene module. The local archive retains its MIT notice. The original notice is also in [Git history](https://github.com/NathanPalaiologos/TableOrbit/blob/2c8eca7cca323a7eba191fa67d2d4b2a364be0cf/web/vendor/THREE-LICENSE.txt). The current reader and VSIX do not use Three.js. |

Example data are supplied for reproducing the viewer demonstrations and checks. Availability from a public source does not imply that its data are covered by the application's MIT license.
