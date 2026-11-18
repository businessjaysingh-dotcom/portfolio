'use strict';
/* Property desk: a one-address, browser-only sample of the property-research workspace.
   The anonymised sample opens from a saved public-data capture (7 Nov 2026).
   Any other City of Toronto address is looked up live from the City's public data services.
   The selected public address and pins are kept in sessionStorage for this tab visit. */
(() => {
  const D = window.PROPERTY_DATA;
  const $ = s => document.querySelector(s);
  const root = $('#pd-console');
  if (!D || !root) return;

  const VISIT_KEY = 'jay-property-visit-v1';
  function remember() {
    if (!selected) return;
    try { sessionStorage.setItem(VISIT_KEY, JSON.stringify({property: P, pins: [...pins.keys()], done: state === 'done'})); }
    catch { /* Restricted storage: this page still keeps its current visit. */ }
  }
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const fmt = d => d.toLocaleDateString('en-CA', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Toronto'});
  const day = s => {
    if (!s && s !== 0) return 'not recorded';
    const d = typeof s === 'number' ? new Date(s) : new Date(String(s).slice(0, 10) + 'T12:00:00');
    if (isNaN(d)) return String(s);
    // These are calendar-date fields, not visitor-local event timestamps.
    return typeof s === 'number'
      ? d.toLocaleDateString('en-CA', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'})
      : fmt(d);
  };
  const norm = s => String(s ?? '').toUpperCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();

  /* ---------- Sources ---------- */
  const GIS = 'https://gis.toronto.ca/arcgis/rest/services/';
  const CKAN = 'https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/datastore_search';
  const API = {
    address: GIS + 'cot_geospatial27/MapServer/101',
    zoning: GIS + 'cot_geospatial11/MapServer/3',
    heritage: GIS + 'cot_geospatial11/MapServer/56',
    planning: 'https://services3.arcgis.com/b9WvedVPoizGfvfD/ArcGIS/rest/services/COTGEO_IBMS_AIC_POINT/FeatureServer/0',
    buildings: 'https://services6.arcgis.com/Do88DoK2xjTUCXd1/ArcGIS/rest/services/OSM_NA_Buildings/FeatureServer/0',
    permits: '6d0229af-bc54-46de-9c2b-26759b01dd05',
    licences: '169e90ba-3ae0-43dd-8b2f-919e87002f50'
  };
  const SRC = {
    zoning: ['City of Toronto zoning layer', API.zoning],
    permit: ['City of Toronto active building permits', 'https://open.toronto.ca/dataset/building-permits-active-permits/'],
    licence: ['City of Toronto business licences', 'https://open.toronto.ca/dataset/municipal-licensing-and-standards-business-licences-and-permits/'],
    planning: ['City development applications index', API.planning],
    heritage: ['City heritage register layer', API.heritage]
  };
  async function arc(base, params) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 14000);
    try {
      const r = await fetch(base + '/query?' + new URLSearchParams(params), {signal: ctl.signal});
      const j = await r.json();
      if (j.error || !Array.isArray(j.features)) throw new Error('source error');
      return j;
    } finally { clearTimeout(t); }
  }
  let jsonpId = 0;
  function ckan(params) {           // The open-data API has no CORS header; it does support a callback.
    return new Promise((resolve, reject) => {
      const name = '__pd_cb' + (++jsonpId), s = document.createElement('script');
      const done = () => { clearTimeout(t); delete window[name]; s.remove(); };
      const t = setTimeout(() => { done(); reject(new Error('timeout')); }, 14000);
      window[name] = j => { done(); j && j.success && Array.isArray(j.result?.records) ? resolve(j.result) : reject(new Error('source error')); };
      s.onerror = () => { done(); reject(new Error('network')); };
      s.src = CKAN + '?' + new URLSearchParams({...params, callback: name});
      document.head.append(s);
    });
  }

  /* ---------- The saved capture, shaped like a live result ---------- */
  const SAVED = {
    live: false, address: 'Example property', ward: 'Toronto', sub: 'Anonymised public-record sample', retrieved: new Date(D.captured),
    point: D.map.point, streets: [],
    buildings: D.buildings.map(b => ({id: b.id, path: b.path, target: b.library, label: b.library ? 'Example property' : 'Sample building outline'})),
    zoning: {...D.zoning, string: D.zoning.zone}, zoningCount: 1, permits: D.permits.map((p, i) => ({...p, num: `Sample permit ${i + 1}`, desc: 'Source description hidden in this anonymised sample.'})), permitsMore: false, licences: D.licences.map((l, i) => ({...l, name: 'Name hidden in sample', no: `Sample licence ${i + 1}`})), planning: [], heritage: [], errors: {}
  };
  let P = SAVED;

  /* ---------- Live lookup ---------- */
  const SUFFIX = {AVENUE: 'AVE', STREET: 'ST', ROAD: 'RD', BOULEVARD: 'BLVD', CRESCENT: 'CRES', DRIVE: 'DR', COURT: 'CRT', TERRACE: 'TER', PLACE: 'PL', EAST: 'E', WEST: 'W', NORTH: 'N', SOUTH: 'S'};
  function tokens(q) {
    let text = norm(q).replace(/['’]/g, '');
    // City address fields contain the street, not the borough/province/postcode.
    // Retain unknown place names so out-of-area input cannot match by accident.
    for (;;) {
      const before = text;
      text = text.replace(/\s+[A-Z]\d[A-Z]\s?\d[A-Z]\d$/, '')
        .replace(/\s+(CANADA|ONTARIO|ON)$/, '');
      const area = text.match(/^(.*?)\s+(CITY OF TORONTO|NORTH YORK|EAST YORK|ETOBICOKE|SCARBOROUGH|TORONTO|YORK)$/);
      if (area && area[1].trim().split(/\s+/).length >= 2) text = area[1].trim();
      if (before === text) break;
    }
    return text.split(' ').filter(Boolean).map(x => SUFFIX[x] || x);
  }
  async function searchAddress(q) {
    const t = tokens(q);
    if (!/^\d+[A-Z]?$/.test(t[0] || '')) throw new Error('number');
    if (t.join(' ').length < 4 || /[%_\\]/.test(q)) throw new Error('short');
    const params = {f: 'geojson', outFields: 'ADDRESS_POINT_ID,ADDRESS_FULL,ADDRESS_NUMBER,LINEAR_NAME,WARD_NAME', outSR: 4326, returnGeometry: 'true', resultRecordCount: 50};
    const shape = j => (j.features || []).filter(f => f.geometry).map(f => ({...f.properties, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1]}));
    const compact = s => norm(s).replace(/[\s'’]/g, '');
    const query = flexible => t.map((x, i) => i === 0 && /^\d+[A-Z]?$/.test(x) ? `ADDRESS_NUMBER='${x}'` : `UPPER(ADDRESS_FULL) LIKE '%${flexible && x.length >= 3 ? [...x].join('%') : x}%'`).join(' AND ');
    let response = await arc(API.address, {...params, where: query(false)});
    let list = shape(response);
    if (!list.length && /^\d+[A-Z]?$/.test(t[0])) {
      // ArcGIS rejects SQL REPLACE(). Use LIKE to retrieve possible spaced
      // names, then require a whole-address match after normalising spaces.
      response = await arc(API.address, {...params, where: query(true)});
      const candidates = shape(response);
      list = candidates.filter(a => compact(a.ADDRESS_FULL) === t.join(''));
    }
    const exact = list.find(a => compact(a.ADDRESS_FULL) === t.join(''));
    if (exact) return [exact];
    const bits = t.slice(1), endings = new Set(['ST','RD','AVE','BLVD','CRES','DR','CRT','TER','PL','N','S','E','W']);
    while (bits.length > 1 && endings.has(bits.at(-1))) bits.pop();
    const street = bits.join('');
    list.sort((a, b) => Number(compact(b.LINEAR_NAME || '') === street) - Number(compact(a.LINEAR_NAME || '') === street) || a.ADDRESS_FULL.localeCompare(b.ADDRESS_FULL));
    list.more = !!response.exceededTransferLimit;
    return list;
  }
  function inRing(pt, ring) { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) inside = !inside; } return inside; }
  async function lookup(a) {
    const {lat, lon} = a, id = String(a.ADDRESS_POINT_ID), full = norm(a.ADDRESS_FULL), k = Math.cos(lat * Math.PI / 180);
    const proj = c => [+(((c[0] - lon) * k * 111320 + 140) * 2.6).toFixed(1), +((-(c[1] - lat) * 110540 + 105) * 2.6).toFixed(1)];
    const dlon = 145 / (111320 * k), dlat = 112 / 110540;
    const jobs = {
      buildings: arc(API.buildings, {f: 'geojson', geometry: `${lon - dlon},${lat - dlat},${lon + dlon},${lat + dlat}`, geometryType: 'esriGeometryEnvelope', inSR: 4326, outSR: 4326, spatialRel: 'esriSpatialRelIntersects', outFields: 'OBJECTID,name', resultRecordCount: 300}),
      zoning: arc(API.zoning, {f: 'json', geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', outFields: 'ZN_STRING,ZN_ZONE,FSI_TOTAL,ZN_FRONTAGE,ZN_AREA,ZN_COVERAGE', returnGeometry: 'false'}),
      permits: ckan({resource_id: API.permits, filters: JSON.stringify({GEO_ID: id}), fields: 'PERMIT_NUM,PERMIT_TYPE,WORK,STREET_NUM,STREET_NAME,APPLICATION_DATE,ISSUED_DATE,STATUS,DESCRIPTION', limit: 50}),
      licences: ckan({resource_id: API.licences, q: JSON.stringify({'Licence Address Line 1': full}), fields: 'Category,Licence No.,Operating Name,Issued,Licence Address Line 1,Cancel Date', limit: 100}),
      planning: arc(API.planning, {f: 'json', where: `FULL_ADDRESS='${full.replace(/'/g, "''")}'`, outFields: 'APPLICATION_NUMBER,APPLICATION_TYPE,FOLDERTYPE_DESC,STATUS_DESC,SUBMIT_DATE,FOLDERDESCRIPTION', returnGeometry: 'false', resultRecordCount: 50}),
      heritage: arc(API.heritage, {f: 'json', where: `UPPER(ADDRESS) LIKE '${full.split(' ').join('%').replace(/'/g, "''")}%'`, outFields: 'ADDRESS,STATUS,BYLAW,DETAILS', returnGeometry: 'false', resultRecordCount: 50})
    };
    const keys = Object.keys(jobs), res = await Promise.allSettled(Object.values(jobs)), R = {}, errors = {};
    keys.forEach((key, i) => res[i].status === 'fulfilled' ? R[key] = res[i].value : errors[key] = true);

    const buildings = [];
    let targetName = '';
    for (const f of R.buildings?.features || []) {
      const g = f.geometry; if (!g) continue;
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      if (!polys.length) continue;
      const target = polys.some(p => p[0] && inRing([lon, lat], p[0]));
      if (target && f.properties.name) targetName = f.properties.name;
      buildings.push({id: String(f.properties.OBJECTID), target, label: target ? a.ADDRESS_FULL : (f.properties.name || 'Mapped outline'),
        path: polys.map(p => p.map(r => 'M' + r.map(c => proj(c).join(' ')).join('L') + 'Z').join('')).join('')});
    }
    buildings.sort((x, y) => x.target - y.target);

    const z = R.zoning?.features?.[0]?.attributes;
    const permits = (R.permits?.records || []).filter(p => norm(p.STREET_NUM) === norm(a.ADDRESS_NUMBER) && norm(p.STREET_NAME) === norm(a.LINEAR_NAME))
      .map(p => ({num: p.PERMIT_NUM, type: p.PERMIT_TYPE, work: String(p.WORK || '').trim(), status: p.STATUS, applied: p.APPLICATION_DATE, issued: p.ISSUED_DATE, desc: String(p.DESCRIPTION || '').replace(/\s+/g, ' ').trim()}))
      .sort((x, y) => String(y.applied || '').localeCompare(String(x.applied || '')));
    const seen = new Set();
    const licences = (R.licences?.records || []).filter(l => { const line = norm(l['Licence Address Line 1']); return (line === full || line.startsWith(full + ' ')) && !seen.has(l['Licence No.']) && seen.add(l['Licence No.']); })
      .map(l => ({name: String(l['Operating Name'] || 'No operating name recorded').trim(), category: String(l.Category || '').trim(), no: l['Licence No.'], issued: l.Issued, cancelled: l['Cancel Date']}));
    const planning = (R.planning?.features || []).map(f => f.attributes).map(p => ({no: p.APPLICATION_NUMBER, type: p.FOLDERTYPE_DESC || p.APPLICATION_TYPE, status: p.STATUS_DESC, submitted: p.SUBMIT_DATE, desc: String(p.FOLDERDESCRIPTION || '').replace(/\s+/g, ' ').trim()}));
    const heritage = (R.heritage?.features || []).map(f => f.attributes).filter(h => { const x = norm(h.ADDRESS); return x === full || x.startsWith(full + ' '); })
      .map(h => ({address: h.ADDRESS, status: h.STATUS, bylaw: h.BYLAW, details: String(h.DETAILS || '').replace(/\s+/g, ' ').trim()}));
    return {
      live: true, address: a.ADDRESS_FULL, ward: a.WARD_NAME || 'Toronto', sub: targetName || 'Official City address', retrieved: new Date(),
      point: [364, 273], streets: [], buildings,
      zoning: z ? {string: String(z.ZN_STRING || '').replace(/\s+/g, ' ').trim(), zone: z.ZN_ZONE, fsi: z.FSI_TOTAL, frontage: z.ZN_FRONTAGE, area: z.ZN_AREA, coverage: z.ZN_COVERAGE} : null,
      zoningCount: R.zoning?.features?.length || 0, permits, permitsMore: (R.permits?.total || 0) > 50, licences, licencesMore: (R.licences?.total || 0) > 100, planning, heritage, planningMore: !!R.planning?.exceededTransferLimit, heritageMore: !!R.heritage?.exceededTransferLimit, errors
    };
  }

  /* ---------- State ---------- */
  let state = 'ready', selected = false, busy = false, restoring = false, tab = 'zoning';
  const pins = new Map();
  const total = () => (P.zoning ? 1 : 0) + P.permits.length + P.licences.length + P.planning.length + P.heritage.length;
  const when = () => (P.live ? 'Retrieved ' : 'Saved capture, retrieved ') + fmt(P.retrieved);

  /* ---------- What each pinned record says in the brief ---------- */
  function entry(key) {
    const [kind, n] = key.split(':'), i = +n;
    if (kind === 'zoning') return {kind, label: 'Zoning', fact: (zoneName(P.zoning.zone) ? zoneName(P.zoning.zone) + ' · ' : '') + P.zoning.string, limit: 'Matched at the address point. Not a ruling on the whole lot or on permitted use.'};
    if (kind === 'permit') { const p = P.permits[i]; return {kind, label: 'Permit ' + p.num, fact: `${p.work || p.type}. ${p.status}. Applied ${day(p.applied)}.`, note: p.desc, limit: 'From the active-permits dataset, which is not a complete permit history.'}; }
    if (kind === 'licence') { const l = P.licences[i]; return {kind, label: 'Licence ' + l.no, fact: `${l.name}. Issued ${day(l.issued)}. ${l.cancelled ? 'Cancelled ' + day(l.cancelled) + '.' : 'No cancellation recorded.'}`, limit: 'A licence address does not prove who occupies the space today.'}; }
    if (kind === 'planning' && n !== undefined) { const a = P.planning[i]; return {kind, label: 'Application ' + a.no, fact: `${a.type || 'Development application'}. ${a.status || 'Status not recorded'}. Submitted ${day(a.submitted)}.`, note: a.desc, limit: 'An application is a proposal. It does not show what was approved or built.'}; }
    if (kind === 'heritage' && n !== undefined) { const h = P.heritage[i]; return {kind, label: 'Heritage register', fact: `${h.status || 'Status not recorded'}${heritageMeaning(h.status) ? ' · ' + heritageMeaning(h.status) : ''}${h.bylaw ? '. By-law ' + h.bylaw : ''}.`, note: h.details, limit: 'Register entry as published. Confirm the current status with Heritage Planning.'}; }
    if (kind === 'planning') return {kind, label: 'Development applications', fact: 'None matched this address in the City index.', limit: (P.planningMore ? 'The returned result set is limited; additional matches may exist. ' : '') + 'No match is not a clearance.'};
    return {kind: 'heritage', label: 'Heritage', fact: 'No record matched this exact address.', limit: (P.heritageMore ? 'The returned result set is limited; additional matches may exist. ' : '') + 'Other address variants were not checked.'};
  }

  /* ---------- Map ---------- */
  const map = $('#pd-map');
  map.setAttribute('viewBox', `0 0 ${D.map.w} ${D.map.h}`);
  function drawMap() {
    map.setAttribute('aria-label', `${P.live ? `Building outlines around ${P.address}, Toronto.` : 'Anonymised saved example of building outlines.'} Select the highlighted building.`);
    map.innerHTML =
      P.streets.map(s => `<text class="pd-street" x="${s.x}" y="${s.y}" transform="rotate(${s.r} ${s.x} ${s.y})" text-anchor="middle">${esc(s.t.toUpperCase())}</text>`).join('') +
      P.buildings.map(b => `<path class="pd-b${b.target ? ' pd-target' : ''}" d="${b.path}" pathLength="1" fill-rule="evenodd" tabindex="${b.target ? 0 : -1}" role="button" data-id="${b.id}" aria-label="${esc(b.label)}${b.target ? '. Select this building' : '. Outline only'}"/>`).join('') +
      `<text class="pd-map-label" x="${Math.min(P.point[0] + 15, 400)}" y="${P.point[1] - 19}">${esc(P.address.length > 30 ? P.address.slice(0, 29) + "…" : P.address)}</text><g class="pd-point" transform="translate(${P.point[0]} ${P.point[1]})" aria-hidden="true"><circle class="pd-ring" r="9"/><circle class="pd-dot" r="7"/></g>`;
    $('#pd-attr').textContent = `Outlines © OpenStreetMap contributors, ODbL · ${when().toLowerCase()}`;
  }
  const say = text => { $('#pd-feedback').textContent = text; };
  function mapNote(text, choices) {
    const n = $('#pd-map-note'); n.textContent = text;
    if (choices) choices.forEach((a, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'pd-choice'; b.textContent = a.ADDRESS_FULL; b.addEventListener('click', () => open(a)); n.append(i ? ' ' : document.createElement('br'), b); });
  }

  function choose(id) {
    if (state !== 'running' || busy) return;
    const b = P.buildings.find(x => x.id === id); if (!b) return;
    map.querySelectorAll('.pd-b').forEach(p => p.classList.toggle('is-looked', p.dataset.id === id && !b.target));
    if (b.target) return select();
    mapNote(`${b.label}: outline only. ${selected ? `This visit is for ${P.address}; its records are open.` : "To open a building, type its address and press Find."}`);
  }
  function select() {
    if (selected) { mapNote(`${P.address} is selected. Its records are open.`); return; }
    selected = true;
    $('#pd-address').disabled = true; $('#pd-find button').disabled = true; $('#pd-start').disabled = true;
    root.dataset.selected = 'true';
    map.querySelector('.pd-target')?.classList.add('is-selected');
    const failed = Object.keys(P.errors).filter(k => k !== 'buildings');
    mapNote(`${P.address} selected. ${P.sub}, ${P.ward}. One address per visit, so Find is now off.` + (P.buildings.some(b => b.target) ? '' : ' No mapped outline contains this address point.'));
    say(`${total()} ${total() === 1 ? 'record' : 'records'} returned from the City${failed.length ? `; ${failed.length} ${failed.length === 1 ? 'source' : 'sources'} did not answer` : ''}. Take your time. Pin the lines you want to keep, then finish the brief.`);
    tab = 'zoning'; renderRecords(); renderBrief(); step(2); remember();
    if (!restoring) $('#pd-tab-zoning').focus({preventScroll: true});
    if (!restoring && matchMedia('(max-width: 900px)').matches) $('#pd-records').scrollIntoView({behavior: reduce.matches ? 'instant' : 'smooth', block: 'nearest'});
  }
  function loadingRecords(text) { $('#pd-records').innerHTML = `<div class="pd-loading"><p class="pd-kicker">LOOKING UP CITY RECORDS</p><p>${esc(text)}</p><i></i><i></i><i></i></div>`; }
  async function open(a) {           // live: fetch everything for one City address point
    busy = true; root.dataset.busy = 'true';
    mapNote(`Asking the City about ${a.ADDRESS_FULL}…`); loadingRecords('Opening the source records for your selected property.'); say('Looking up live City records. An unsuccessful search does not use your lookup.');
    try {
      const next = await lookup(a);
      if (state !== 'running') return;
      P = next; pins.clear(); renderBrief(); selected = false; delete root.dataset.selected; drawMap();
      $('#pd-address').value = P.address;
      select();
    } catch { mapNote('The City’s services did not answer. Try again, or use the anonymised saved sample.'); say('Lookup failed. You can try again.'); }
    finally { busy = false; delete root.dataset.busy;  }
  }
  map.addEventListener('click', e => { const p = e.target.closest('.pd-b'); if (p) choose(p.dataset.id); });
  map.addEventListener('keydown', e => { const p = e.target.closest('.pd-b'); if (p && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); choose(p.dataset.id); } });
  $('#pd-find').addEventListener('submit', async e => {
    e.preventDefault();
    if (state !== 'running' || busy || selected) return;
    const raw = $('#pd-address').value.trim(), q = tokens(raw).join(' ');
    if (!q) return mapNote('Type a City of Toronto street address, then press Find.');
    if (selected && q === norm(P.address)) return select();
    busy = true; root.dataset.busy = 'true'; mapNote(`Searching City of Toronto addresses for “${raw}”…`); loadingRecords('Finding the official City address.');
    let list;
    try { list = await searchAddress(raw); }
    catch (err) { $('#pd-records').innerHTML = '<div class="pd-rec-wait"><p>Check the search message below the map, then try again.</p></div>'; return mapNote(err.message === 'number' ? 'Start with the street number, then the street name.' : err.message === 'short' ? 'Type the street number and street name.' : 'The City address service did not answer. Try again, or use the saved sample.'); }
    finally { busy = false; delete root.dataset.busy;  }
    if (state !== 'running') return;
    if (!list.length) { $('#pd-records').innerHTML = '<div class="pd-rec-wait"><p>No matching address yet. Check the spelling or try the saved sample.</p></div>'; return mapNote('No City of Toronto address matched that spelling. Try the street number and street name. Toronto includes Etobicoke, Scarborough, North York and East York. Mississauga, Vaughan and other GTA cities are outside this desk.'); }
    if (list.length === 1) return open(list[0]);
    $('#pd-records').innerHTML = '<div class="pd-rec-wait"><p>Choose the matching address below the map to open its records.</p></div>';
    mapNote('Choose the matching City address.' + (list.length > 8 || list.more ? ' More matches exist; add the street type or direction to narrow it down.' : ''), list.slice(0, 8));
  });

  /* ---------- Records ---------- */
  const tabsFor = () => [['zoning', 'Zoning', P.zoning ? 1 : null], ['permits', 'Permits', P.permits.length], ['licences', 'Licences', P.licences.length], ['planning', 'Planning', P.planning.length], ['heritage', 'Heritage', P.heritage.length]];
  const pinBtn = key => { const e = entry(key); return `<button type="button" class="pd-pin" data-pin="${key}" aria-label="Pin ${esc(e.label)} to the brief" aria-pressed="${pins.has(key)}">${pins.has(key) ? 'Pinned' : 'Pin to brief'}</button>`; };
  const source = kind => `<a class="pd-src" href="${SRC[kind][1]}" target="_blank" rel="noopener noreferrer">${SRC[kind][0]} ↗</a>`;
  const foot = (kind, key, first) => `<div class="pd-card-foot">${first ? source(kind) : '<span></span>'}${pinBtn(key)}</div>`;
  const down = kind => `<article class="pd-card pd-empty" style="--i:0"><p class="pd-kicker">SOURCE DID NOT ANSWER</p><h4>This City source did not respond just now.</h4><p class="pd-limit">That is not the same as “no records”. Open the source directly to check it.</p><div class="pd-card-foot">${source(kind)}<span></span></div></article>`;
  const none = key => { const e = entry(key); return `<article class="pd-card pd-empty" style="--i:0"><p class="pd-kicker">0 RECORDS RETURNED</p><h4>${e.fact}</h4><p class="pd-limit">${e.limit} A checked “nothing found” still belongs in a brief.</p>${foot(e.kind, key, true)}</article>`; };
  const v = x => x === null || x === undefined || x === '' ? 'Not supplied' : esc(x);

  // Category names checked against City zoning chapters 10, 40 and 60.
  const ZONE_NAMES = {R: 'Residential zone', RD: 'Residential Detached zone', RS: 'Residential Semi-Detached zone', CR: 'Commercial Residential zone', E: 'Employment Industrial zone', EL: 'Employment Light Industrial zone', EH: 'Employment Heavy Industrial zone', EO: 'Employment Industrial Office zone'};
  const zoneName = code => ZONE_NAMES[String(code || '').trim().toUpperCase()] || '';
  function heritageMeaning(status) {
    const x = norm(status);
    if (x === 'PART V') return 'Heritage conservation district designation';
    if (x === 'PART IV') return 'Individual-property heritage designation';
    if (x === 'LISTED') return 'Listed on the register; not the same as designation';
    return '';
  }

  function panel() {
    if (tab === 'zoning') {
      if (P.errors.zoning) return down('zoning');
      const z = P.zoning;
      if (!z) return `<article class="pd-card pd-empty" style="--i:0"><p class="pd-kicker">ZONING NOT RETURNED</p><h4>No zoning record returned for this address point.</h4><p class="pd-limit">An older by-law may apply. Ask City Planning which by-law covers the property; an empty result does not mean there are no zoning rules.</p><div class="pd-card-foot">${source('zoning')}<span></span></div></article>`;
      return `<article class="pd-card pd-zoning" style="--i:0"><p class="pd-kicker">${P.live ? "ZONE STRING AT THE ADDRESS POINT" : "ZONE CATEGORY / ANONYMISED SAMPLE"}</p><h4>${esc(z.string)}</h4><p class="pd-explainer">${esc(zoneName(z.zone) || "City category code " + (z.zone || "not supplied"))}</p><p class="pd-limit">A category name helps you read the record. Check the by-law and site-specific rules for permitted uses.</p><details class="pd-raw"><summary>Raw values from the source</summary><dl><div><dt>Zone category</dt><dd>${v(z.zone)}</dd></div><div><dt>FSI, raw City value</dt><dd>${v(z.fsi)}</dd></div><div><dt>Frontage rule, as coded</dt><dd>${v(z.frontage)}</dd></div><div><dt>Area rule, as coded</dt><dd>${v(z.area)}</dd></div><div><dt>Coverage rule</dt><dd>${v(z.coverage)}</dd></div></dl></details><p class="pd-limit">Point match. Not a ruling on the whole lot or on permitted use. A value of −1 is the City’s own code; confirm what it means at the source.${P.zoningCount > 1 ? ` ${P.zoningCount} zoning areas touch this point; the first is shown.` : ''}</p>${foot('zoning', 'zoning', true)}</article>`;
    }
    if (tab === 'permits') {
      if (P.errors.permits) return down('permit');
      if (!P.permits.length) return `<article class="pd-card pd-empty" style="--i:0"><p class="pd-kicker">0 RECORDS RETURNED</p><h4>No active-permit records matched this address point.</h4><p class="pd-limit">The active-permits dataset is not a complete permit history. Cleared permits live in a separate dataset this sample does not query.</p><div class="pd-card-foot">${source('permit')}<span></span></div></article>`;
      return `<p class="pd-limit pd-list-note">${P.permits.length} ${P.permits.length === 1 ? 'record' : 'records'} from the active-permits dataset, newest application first. Not a complete permit history.${P.permitsMore ? ' The City holds more than the 50 this sample requests.' : ''}</p>` + P.permits.map((p, i) =>
        `<article class="pd-card pd-row" style="--i:${Math.min(i, 8)}"><div class="pd-row-head"><h4>${esc(p.num)}</h4><span class="pd-chip">${esc(p.status)}</span></div><p class="pd-meta">${esc(p.work || p.type)} · applied ${day(p.applied)}</p><p class="pd-desc">${esc(p.desc)}</p>${foot('permit', 'permit:' + i, i === 0)}</article>`).join('');
    }
    if (tab === 'licences') {
      if (P.errors.licences) return down('licence');
      if (!P.licences.length) return `<article class="pd-card pd-empty" style="--i:0"><p class="pd-kicker">0 RECORDS RETURNED</p><h4>No business licence is recorded at this exact address.</h4><p class="pd-limit">Many businesses do not need a municipal licence, so this does not show the space is empty.</p><div class="pd-card-foot">${source('licence')}<span></span></div></article>`;
      return `<p class="pd-limit pd-list-note">${P.licences.length} licence records returned at this address.${P.licencesMore ? ' Results are capped at 100; more matches may exist in the source.' : ''} A licence address does not prove who occupies the space today.</p>` + P.licences.map((l, i) =>
        `<article class="pd-card pd-row" style="--i:${Math.min(i, 8)}"><div class="pd-row-head"><h4>${esc(l.name)}</h4><span class="pd-chip${l.cancelled ? ' pd-chip-off' : ''}">${l.cancelled ? 'Cancelled' : 'No cancellation recorded'}</span></div><p class="pd-meta">${esc(l.category)} · ${esc(l.no)}</p><p class="pd-desc">Issued ${day(l.issued)}${l.cancelled ? ', cancelled ' + day(l.cancelled) : ''}.</p>${foot('licence', 'licence:' + i, i === 0)}</article>`).join('');
    }
    if (P.errors[tab]) return down(tab);
    if (tab === 'planning' && P.planning.length) return `<p class="pd-limit pd-list-note">Development applications filed at this exact address.${P.planningMore ? ' The City has more results than this view returned.' : ''} A proposal is not an approval.</p>` + P.planning.map((a, i) =>
      `<article class="pd-card pd-row" style="--i:${Math.min(i, 8)}"><div class="pd-row-head"><h4>${esc(a.no)}</h4><span class="pd-chip">${esc(a.status || 'Status not recorded')}</span></div><p class="pd-meta">${esc(a.type || 'Application')} · submitted ${day(a.submitted)}</p><p class="pd-desc">${esc(a.desc)}</p>${foot('planning', 'planning:' + i, i === 0)}</article>`).join('');
    if (tab === 'heritage' && P.heritage.length) return (P.heritageMore ? '<p class="pd-limit pd-list-note">The City has more results than this view returned.</p>' : '') + P.heritage.map((h, i) =>
      `<article class="pd-card pd-row" style="--i:${i}"><div class="pd-row-head"><h4>${esc(h.address)}</h4><span class="pd-chip">${esc(h.status || 'Status not recorded')}</span></div><p class="pd-explainer">${esc(heritageMeaning(h.status))}</p><p class="pd-meta">${h.bylaw ? 'By-law ' + esc(h.bylaw) : 'No by-law number recorded'}</p><p class="pd-desc">${esc(h.details)}</p>${foot('heritage', 'heritage:' + i, i === 0)}</article>`).join('');
    return none(tab);
  }
  function renderRecords() {
    const T = tabsFor();
    $('#pd-records').innerHTML = `<header class="pd-rec-head"><p class="pd-kicker">${esc(P.ward.toUpperCase())} / ${esc(when().toUpperCase())}</p><h3>${esc(P.address)}</h3><details class="pd-provenance"><summary>Sources, match and coverage</summary><p>${P.live ? 'Retrieved from source services ' + P.retrieved.toLocaleString('en-CA', {timeZone: 'America/Toronto'}) + ' Toronto time.' : 'Saved sample captured ' + fmt(P.retrieved) + '; not refreshed live. Identifying names and record IDs are hidden in this sample.'} Retrieval time is not the date each source record changed.</p><ul><li>The address is matched to the City address index.</li><li>Zoning is matched at the address point, not the whole legal lot.</li><li>Permits come from the active-permits dataset and are not a complete history. Licence matches may include units at the address; they do not establish present occupancy.</li><li>Planning and heritage use address text. Address ranges and aliases are not comprehensively checked; historical addresses may be absent from the current address index.</li><li>Source outages are shown separately from an empty result. Result caps are shown when the source reports them.</li><li>Building outlines are OpenStreetMap reference geometry, not legal parcel boundaries.</li></ul></details></header><div class="pd-tabs" role="tablist" aria-label="Record types">${T.map(([id, name, n]) => `<button type="button" role="tab" id="pd-tab-${id}" aria-controls="pd-panel" aria-selected="${id === tab}" tabindex="${id === tab ? 0 : -1}" data-tab="${id}">${name}<small>${P.errors[id] ? '!' : n === null ? '—' : n}</small></button>`).join('')}</div><div class="pd-panel" id="pd-panel" role="tabpanel" aria-labelledby="pd-tab-${tab}" tabindex="0">${panel()}</div>`;
  }
  function showTab(name, focus) {
    tab = name;
    document.querySelectorAll('#pd-records [data-tab]').forEach(b => { const on = b.dataset.tab === name; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
    const p = $('#pd-panel'); p.setAttribute('aria-labelledby', 'pd-tab-' + name); p.innerHTML = panel(); p.scrollTop = 0;
  }
  $('#pd-records').addEventListener('click', e => {
    const t = e.target.closest('[data-tab]'); if (t) return showTab(t.dataset.tab);
    const p = e.target.closest('[data-pin]'); if (p) togglePin(p.dataset.pin, p);
  });
  $('#pd-records').addEventListener('keydown', e => {
    const t = e.target.closest('[data-tab]');
    if (!t || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const T = tabsFor(), i = T.findIndex(x => x[0] === t.dataset.tab);
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? T.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : T.length - 1)) % T.length;
    showTab(T[n][0], true);
  });

  /* ---------- Brief ---------- */
  function togglePin(key, btn) {
    if (state !== 'running') return;
    if (pins.has(key)) pins.delete(key); else pins.set(key, entry(key));
    if (btn) { btn.setAttribute('aria-pressed', String(pins.has(key))); btn.textContent = pins.has(key) ? 'Pinned' : 'Pin to brief'; }
    renderBrief(pins.has(key) ? key : null);
    if (pins.size) { step(3); say(`${pins.size} pinned. Add more, or finish the brief.`); } else say('Brief is empty. Pin a record to add it.');
  }
  function renderBrief(fresh) {
    remember();
    $('#pd-brief-list').innerHTML = pins.size ? [...pins].map(([key, e]) => `<li class="${key === fresh ? 'is-fresh' : ''}"><div><strong>${esc(e.label)}</strong><span>${esc(e.fact)}</span></div><button type="button" data-unpin="${key}" aria-label="Remove ${esc(e.label)} from the brief">×</button></li>`).join('') : '<li class="pd-brief-empty">Pin a record and it lands here, with its source and its limit.</li>';
    $('#pd-count').textContent = pins.size ? `${pins.size} pinned` : 'Empty';
    $('#pd-finish').disabled = !selected;
  }
  $('#pd-brief-list').addEventListener('click', e => {
    const b = e.target.closest('[data-unpin]'); if (!b) return;
    const key = b.dataset.unpin;
    togglePin(key, document.querySelector(`#pd-records [data-pin="${key}"]`));
    $('#pd-finish').disabled ? $('#pd-panel')?.focus() : $('#pd-finish').focus();
  });
  $('#pd-finish').addEventListener('click', () => finish(true));

  /* One successful address per tab visit; no reading deadline. */
  function step(n) { root.querySelectorAll('.pd-steps li').forEach(li => { const x = +li.dataset.step; li.classList.toggle('is-done', x < n); if (x === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); }); }
  function setState(next) {
    state = next; root.dataset.state = next;
    $('#pd-work').inert = next !== 'running';
    $('#pd-done').hidden = next !== 'done';
    $('#pd-work').hidden = next === 'done';
  }
  function start() {
    if (selected || busy) return;
    P = SAVED; pins.clear(); drawMap(); setState('running');
    $('#pd-address').value = '';
    select();
  }
  $('#pd-start').addEventListener('click', start);

  /* ---------- The finished brief ---------- */
  let briefText = '';
  function finish(early) {
    const r = root.getBoundingClientRect();
    const here = early || root.contains(document.activeElement) || (r.bottom > 0 && r.top < innerHeight);
    const own = pins.size > 0, n = total();
    const picks = [P.zoning && 'zoning', P.permits.length && 'permit:0', P.licences.length && 'licence:0', P.planning.length ? 'planning:0' : !P.errors.planning && 'planning', P.heritage.length ? 'heritage:0' : !P.errors.heritage && 'heritage'].filter(Boolean).slice(0, 3);
    const items = own ? [...pins.values()] : picks.map(entry);
    const footLine = `${when()}.${P.live ? '' : ' Not refreshed since.'}${['permitsMore','licencesMore','planningMore','heritageMore'].some(k => P[k]) ? ' One or more source result sets were capped.' : ''} Sample brief, not advice.`;
    $('#pd-sheet').innerHTML = `<p class="pd-kicker">PROPERTY BRIEF / ${own ? 'YOUR PINS' : 'JAY’S FIRST PICKS'}</p><h3>${esc(P.address)}</h3><p class="pd-sheet-sub">${esc(P.sub)} · ${esc(P.ward)}</p><ol>${items.map(e => `<li><strong>${esc(e.label)}</strong><span>${esc(e.fact)}</span>${e.note ? `<q>${esc(e.note)}</q>` : ''}<em>${esc(e.limit)}</em><a href="${SRC[e.kind][1]}" target="_blank" rel="noopener noreferrer">${SRC[e.kind][0]} ↗</a></li>`).join('')}</ol><p class="pd-sheet-foot">${esc(footLine)}</p>`;
    briefText = `PROPERTY BRIEF: ${P.address} (${P.sub}, ${P.ward})\n\n` + items.map((e, i) => `${i + 1}. ${e.label}: ${e.fact}${e.note ? '\n   City description: ' + e.note : ''}\n   Limit: ${e.limit}\n   Source: ${SRC[e.kind][1]}`).join('\n\n') + `\n\n${footLine}`;
    const real = [...pins.keys()].filter(k => k === 'zoning' || k.includes(':')).length;
    $('#pd-done-title').innerHTML = own
      ? `${pins.size} ${pins.size === 1 ? 'line' : 'lines'} pinned.<br><em>${n - real} of ${n} records still on file.</em>`
      : `Your building,<br><em>a starting brief.</em>`;
    $('#pd-done-copy').textContent = own
      ? 'Each line kept its source and the thing it does not prove. That is the part a search box cannot do for you: deciding which records answer the question, and saying plainly where they stop.'
      : `The desk returned ${n} ${n === 1 ? 'record' : 'records'} for this address. These are the lines I would open first, each with its source and the thing it does not prove.`;
    $('#pd-copy').textContent = 'Copy the brief';
    setState('done'); step(4); remember();
    $('#after-desk').hidden = false;
    say('The sample is closed. Your brief is ready below.');
    if (here && !restoring) { $('#pd-done').focus({preventScroll: true}); root.scrollIntoView({behavior: reduce.matches ? 'instant' : 'smooth', block: 'start'}); }
  }
  $('#pd-copy').addEventListener('click', async e => {
    const btn = e.currentTarget;
    try { await navigator.clipboard.writeText(briefText); btn.textContent = 'Copied'; say('Brief copied as plain text.'); }
    catch { btn.textContent = 'Copy not available here'; say('Copying is blocked in this browser. Select the brief text instead.'); }
  });

  drawMap(); renderBrief(); step(1); setState('running');
  try {
    const saved = JSON.parse(sessionStorage.getItem(VISIT_KEY) || 'null');
    if (saved?.property?.address && Array.isArray(saved.pins)) {
      restoring = true; P = saved.property; P.retrieved = new Date(P.retrieved);
      if (isNaN(P.retrieved)) throw new Error('Invalid saved date');
      drawMap(); setState('running'); select();
      for (const key of saved.pins) { try { pins.set(key, entry(key)); } catch {} }
      renderBrief();
      $('#pd-address').value = P.address;
      if (saved.done) finish(false);
      else say('Your building and pins are kept for this tab visit. Continue your brief.');
      restoring = false;
    }
  } catch { /* Storage is optional. */ }

  /* Gentle section reveals; content is never hidden if this does not run. */
  if ('IntersectionObserver' in window && !reduce.matches) {
    const els = document.querySelectorAll('.project,.pdesk-story,.resources');
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('story-visible'); io.unobserve(e.target); } }), {threshold: .08});
    els.forEach(el => { el.classList.add('story-reveal'); io.observe(el); });
  }
})();
