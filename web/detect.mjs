import { parseTime } from './time.mjs';
import { numericColumns, panelKey } from './data.mjs';

// Names identify possible roles. Full-column values and full-record keys validate them.
// No row is changed, concatenated, dropped or sampled to approve a mapping.
const normalize = name => name.toLowerCase().replace(/[\s_.-]/g, '');
const entityNames = new Set(['id','idcode','entity','firm','company','country','countrycode','iso2','iso3','iso3c','isoalpha3','ticker','symbol','gvkey','permno','permco','cusip','isin','person','household','patient','subject','unit','region','province','city','county','state','个体','个体编号','企业','企业代码','公司','公司代码','国家','国家代码','地区','地区代码','股票代码','证券代码']);
for (const name of ['uuid','guid','cik','sedol','figi','lei','geoid','fips','stkcd','pid','hid','hhid','persnr','证券编码','股票编码','受访者编号','家庭编号','患者编号','地区编码']) entityNames.add(name);
const timeNames = new Set(['t','time','date','year','fyear','fiscalyear','calendaryear','month','quarter','period','wave','timestamp','datetime','observationdate','reportdate','reportingdate','tradedate','surveyyear','yearmonth','yearquarter','时间','日期','年份','年度','年','月份','季度','时期','年月','调查年份','交易日期','报告期']);
for (const name of ['datadate','caldt','trddt','accper','interviewdate','surveydate']) timeNames.add(name);
const isEntity = name => {
  const key = normalize(name);
  if (['rowid','recordid','observationid'].includes(key)) return false;
  return entityNames.has(key) || /[_ .-]id$/i.test(name) || /(?:[a-z]Id|[a-z]ID)$/.test(name)
    || /^(?:firm|company|country|entity|person|patient|subject|household|individual|participant|student|customer|store|bank|security|stock|school|site|station|hh)id$/.test(key);
};
const isTime = name => timeNames.has(normalize(name));

export function detectTimeFormats(parsed, column) {
  if (!parsed.headers.includes(column) || !parsed.rows.length) return [];
  const values = parsed.rows.map(row => String(row[column] ?? '').trim());
  if (values.some(value => !value)) return [];
  const first = values[0];
  let formats = /^\d{4}-\d{2}-\d{2}T/.test(first) ? ['timestamp']
    : /^\d{4}-\d{2}-\d{2}$/.test(first) ? ['date']
    : /^\d{4}-\d{2}$/.test(first) ? ['month']
    : /^\d{4}-Q[1-4]$/.test(first) ? ['quarter']
    : /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(first) ? ['dmy','mdy'] : [];
  // Numeric years/waves remain as supplied, including two-digit year codes.
  // Large numeric encodings could be epochs, Excel serials or compact dates.
  if (!formats.length && isTime(column) && values.every(value => /^-?\d{1,4}$/.test(value))) formats = ['number'];
  return formats.filter(format => {
    try { for (const value of values) parseTime(value,format); return true; }
    catch { return false; }
  });
}

export function suggestMapping(parsed) {
  const entities = parsed.headers.filter(isEntity);
  const times = parsed.headers.filter(isTime);
  const manual = (reason, candidates = []) => ({mapping:null, reason, candidates});
  if (!parsed.rows.length) return manual('detectUnknown');
  // Bound work for unusually wide files without silently considering only the first columns.
  if (entities.length > 8 || times.length > 8) return manual('detectMultiple');
  const profiles = entities.map(column => {
    const values = parsed.rows.map(row => String(row[column] ?? '').trim());
    const numericNotation = values.some(value => value && Number.isFinite(Number(value)) && !/^[+-]?\d+$/.test(value));
    return {column,values,count:new Set(values).size,complete:values.every(Boolean),numericNotation};
  });
  const temporal = times.map(column => ({column,formats:detectTimeFormats(parsed,column)}));
  // A second date column with unresolved interpretation must not lose to a valid one.
  if (temporal.some(profile => profile.formats.length === 0)) return manual('detectTimeUnknown');
  if (temporal.some(profile => profile.formats.length > 1)) return manual('detectDateAmbiguous');
  const candidates = [];
  let duplicate = false, incomplete = false, keyNotation = false;
  for (const time of temporal) {
    const keys = parsed.rows.map(row => parseTime(row[time.column],time.formats[0]).key);
    const periods = new Set(keys).size;
    for (const entity of profiles) {
      if (entity.column === time.column) continue;
      if (!entity.complete) { incomplete = true; continue; }
      if (entity.numericNotation) { keyNotation = true; continue; }
      // A unique record ID paired with a varying date proves no longitudinal identity.
      if (entity.count === parsed.rows.length && periods > 1) continue;
      const seen = new Set();
      let unique = true;
      for (let index=0; index<keys.length; index++) {
        const key = panelKey(entity.values[index],keys[index]);
        if (seen.has(key)) { unique = false; duplicate = true; break; }
        seen.add(key);
      }
      if (unique) candidates.push({mode:'panel',entity:entity.column,time:time.column,timeFormat:time.formats[0]});
    }
  }
  // Separate year/month fields can look unique individually in a short sample.
  // Choosing just one would lose part of the observation's time coordinate.
  if (temporal.length > 1) return manual('detectMultiple',candidates);
  if (candidates.length === 1 && !incomplete && !keyNotation) return {mapping:candidates[0],reason:'detectPanel',candidates};
  if (candidates.length > 1) return manual('detectMultiple',candidates);
  if (incomplete) return manual('detectMissing');
  if (keyNotation) return manual('detectKeyNotation');
  if (duplicate) return manual('detectDuplicate');
  if (!times.length) {
    if (parsed.headers.some(name => /(?:^|[_ -])(?:19|20)\d{2}(?:$|[_ -])/.test(name))) return manual('detectWide');
    const unique = profiles.filter(profile => profile.complete && !profile.numericNotation && profile.count === parsed.rows.length);
    if (unique.length === 1) return {mapping:{mode:'cross-section',entity:unique[0].column},reason:'detectCross',candidates:[]};
    return manual(unique.length > 1 ? 'detectMultiple' : 'detectUnknown');
  }
  if (!entities.length && temporal.length === 1) {
    const time = temporal[0], format = time.formats[0];
    const keys = parsed.rows.map(row => parseTime(row[time.column],format).key);
    if (new Set(keys).size !== keys.length) return manual('detectDuplicate');
    const measures = numericColumns(parsed,[time.column]);
    // Multiple numeric columns could be measures or separate entities in a wide panel.
    if (measures.length === 1 && parsed.headers.length === 2) return {mapping:{mode:'series',time:time.column,timeFormat:format},reason:'detectSeries',candidates:[]};
    return manual('detectWide');
  }
  return manual('detectUnknown');
}
