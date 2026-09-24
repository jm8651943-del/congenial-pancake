const DEFAULT_CITY = process.env.OPTIMIZE_CITY || "San Antonio";
const DEFAULT_STATE = process.env.OPTIMIZE_STATE || "TX";
const DEFAULT_LAT = Number(process.env.OPTIMIZE_LAT || 29.4241);
const DEFAULT_LON = Number(process.env.OPTIMIZE_LON || -98.4936);

const SOURCE_REGISTRY = [
  {
    id: "sanantonio-ckan",
    name: "City of San Antonio Open Data",
    category: "local-government",
    auth: "none",
    discovery: "https://data.sanantonio.gov/api/3/action/package_search",
  },
  {
    id: "texas-socrata",
    name: "Texas Open Data Portal",
    category: "state-government",
    auth: "none",
    discovery: "https://api.us.socrata.com/api/catalog/v1",
  },
  {
    id: "bexar-parcels",
    name: "Bexar County Parcel GIS",
    category: "property",
    auth: "none",
    endpoint: "https://services8.arcgis.com/FQqRYEf8oZEgwaX9/ArcGIS/rest/services/Bexar_County_Parcels/FeatureServer/0/query",
  },
  {
    id: "sanantonio-arcgis",
    name: "City of San Antonio ArcGIS Open Data Services",
    category: "local-geospatial",
    auth: "none-for-public-services",
    discovery: "https://services.arcgis.com/g1fRTDLeMgspWrYp/arcgis/rest/services",
  },
  {
    id: "sam-opportunities",
    name: "SAM.gov Contract Opportunities API",
    category: "federal-procurement",
    auth: "api-key",
    endpoint: "https://api.sam.gov/opportunities/v2/search",
  },
  {
    id: "datagov-catalog",
    name: "Data.gov Catalog",
    category: "federal-open-data",
    auth: "none",
    discovery: "https://catalog.data.gov/api/3/action/package_search",
  },
  {
    id: "usaspending",
    name: "USAspending",
    category: "federal-spending",
    auth: "none",
    endpoint: "https://api.usaspending.gov/api/v2/search/spending_by_award/",
  },
  {
    id: "grantsgov",
    name: "Grants.gov",
    category: "grants",
    auth: "none",
    endpoint: "https://api.grants.gov/v1/api/search2",
  },
  {
    id: "federal-register",
    name: "Federal Register",
    category: "regulatory",
    auth: "none",
    endpoint: "https://www.federalregister.gov/api/v1/documents.json",
  },
  {
    id: "sec",
    name: "SEC EDGAR",
    category: "company-filings",
    auth: "none",
    endpoint: "https://data.sec.gov/submissions/",
  },
  {
    id: "census",
    name: "U.S. Census API",
    category: "demographics",
    auth: "optional-key",
    endpoint: "https://api.census.gov/data",
  },
  {
    id: "bls",
    name: "BLS Public Data API",
    category: "labor-economy",
    auth: "none-v1-or-optional-v2-key",
    endpoint: "https://api.bls.gov/publicAPI/v2/timeseries/data/",
  },
  {
    id: "nws",
    name: "National Weather Service",
    category: "weather",
    auth: "none-user-agent",
    endpoint: "https://api.weather.gov",
  },
  {
    id: "fema",
    name: "OpenFEMA",
    category: "disaster",
    auth: "none",
    endpoint: "https://www.fema.gov/api/open/v2/",
  },
  {
    id: "epa-envirofacts",
    name: "EPA Envirofacts",
    category: "environment",
    auth: "none",
    endpoint: "https://data.epa.gov/efservice/",
  },
  {
    id: "usgs-earthquakes",
    name: "USGS Earthquake Feed",
    category: "hazards",
    auth: "none",
    endpoint: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson",
  },
  {
    id: "usgs-water",
    name: "USGS Water Data APIs",
    category: "water",
    auth: "none-or-key-for-higher-limits",
    endpoint: "https://api.waterdata.usgs.gov/",
  },
  {
    id: "openstreetmap",
    name: "OpenStreetMap Overpass",
    category: "geospatial",
    auth: "none",
    endpoint: "https://overpass-api.de/api/interpreter",
  },
  {
    id: "gdelt",
    name: "GDELT DOC 2.0",
    category: "news-signals",
    auth: "none",
    endpoint: "https://api.gdeltproject.org/api/v2/doc/doc",
  },
];

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": process.env.OPTIMIZE_USER_AGENT || "OPTIMIZE-PrimeForge/1.0 (open-data integration)",
        ...(options.headers || {}),
      },
    });
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("json") || contentType.includes("geojson")
      ? await response.json()
      : await response.text();
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function signal(sourceId, category, title, details = {}) {
  return {
    id: `${sourceId}:${details.id || Buffer.from(`${title}:${JSON.stringify(details)}`).toString("base64url").slice(0, 48)}`,
    sourceId,
    category,
    title,
    observedAt: details.observedAt || new Date().toISOString(),
    location: details.location || null,
    url: details.url || null,
    scoreHint: Number(details.scoreHint || 0),
    details,
  };
}

function uniqueSignals(items) {
  const map = new Map();
  for (const item of items) map.set(item.id, item);
  return [...map.values()];
}

async function fetchSanAntonioCatalog() {
  const terms = ["building permits", "311", "code enforcement", "land development", "procurement"];
  const datasets = [];
  for (const term of terms) {
    const url = `https://data.sanantonio.gov/api/3/action/package_search?q=${encodeURIComponent(term)}&rows=10`;
    const data = await fetchWithTimeout(url);
    for (const pkg of data?.result?.results || []) datasets.push(pkg);
  }
  const seen = new Set();
  const signals = [];
  for (const pkg of datasets) {
    if (seen.has(pkg.name)) continue;
    seen.add(pkg.name);
    const resources = (pkg.resources || []).filter((r) => r.datastore_active || r.url);
    signals.push(signal("sanantonio-ckan", "local-data-discovery", pkg.title || pkg.name, {
      id: pkg.id || pkg.name,
      url: pkg.url || `https://data.sanantonio.gov/dataset/${pkg.name}`,
      scoreHint: pkg.metadata_modified ? 5 : 0,
      description: pkg.notes || null,
      resources: resources.slice(0, 5).map((r) => ({
        id: r.id || null,
        format: r.format || null,
        url: r.url || null,
        datastoreActive: Boolean(r.datastore_active),
        lastModified: r.last_modified || null,
      })),
      observedAt: pkg.metadata_modified || undefined,
    }));
  }
  return signals;
}

async function fetchSanAntonioRecords() {
  const catalogSignals = await fetchSanAntonioCatalog();
  const recordSignals = [];
  const candidateResources = catalogSignals.flatMap((s) => s.details.resources || [])
    .filter((r) => r.datastoreActive && r.id)
    .slice(0, 8);

  for (const resource of candidateResources) {
    const url = `https://data.sanantonio.gov/api/3/action/datastore_search?resource_id=${encodeURIComponent(resource.id)}&limit=50`;
    try {
      const data = await fetchWithTimeout(url);
      for (const row of data?.result?.records || []) {
        recordSignals.push(signal("sanantonio-ckan", "local-record", row.address || row.permit_number || row.id || "San Antonio record", {
          id: row._id || row.id || JSON.stringify(row).slice(0, 120),
          location: row.address || row.location || row.city || DEFAULT_CITY,
          url: resource.url || null,
          scoreHint: 20,
          record: row,
        }));
      }
    } catch {
      // Catalog discovery remains useful even when an individual datastore is unavailable.
    }
  }
  return uniqueSignals([...catalogSignals, ...recordSignals]);
}

async function fetchTexasCatalog() {
  const queries = ["San Antonio building permit", "Bexar construction", "Texas procurement", "Texas business licenses"];
  const signals = [];
  for (const q of queries) {
    const url = `https://api.us.socrata.com/api/catalog/v1?q=${encodeURIComponent(q)}&search_context=data.texas.gov&limit=25`;
    const data = await fetchWithTimeout(url);
    for (const item of data?.results || []) {
      const resource = item.resource || {};
      signals.push(signal("texas-socrata", "state-data-discovery", resource.name || item.metadata?.name || q, {
        id: resource.id || item.metadata?.id,
        url: item.permalink || resource.url || null,
        scoreHint: 8,
        description: resource.description || null,
        columns: resource.columns || [],
        updatedAt: resource.updatedAt || null,
      }));
    }
  }
  return uniqueSignals(signals);
}

async function fetchTexasRecords() {
  const catalog = await fetchTexasCatalog();
  const records = [];
  for (const item of catalog.slice(0, 8)) {
    const datasetId = item.details.id;
    if (!datasetId) continue;
    const url = `https://data.texas.gov/resource/${encodeURIComponent(datasetId)}.json?$limit=50`;
    try {
      const data = await fetchWithTimeout(url);
      for (const row of Array.isArray(data) ? data : []) {
        records.push(signal("texas-socrata", "state-record", row.name || row.title || row.address || "Texas open-data record", {
          id: JSON.stringify(row).slice(0, 160),
          location: row.city || row.county || DEFAULT_STATE,
          url: `https://data.texas.gov/dataset/${datasetId}`,
          scoreHint: 15,
          record: row,
        }));
      }
    } catch {
      // Keep catalog signals when a dataset's public resource cannot be queried generically.
    }
  }
  return uniqueSignals([...catalog, ...records]);
}

async function fetchDataGov() {
  const q = `${DEFAULT_CITY} ${DEFAULT_STATE} construction permits procurement infrastructure`;
  const data = await fetchWithTimeout(`https://catalog.data.gov/api/3/action/package_search?q=${encodeURIComponent(q)}&rows=25`);
  return (data?.result?.results || []).map((pkg) => signal("datagov-catalog", "federal-data-discovery", pkg.title || pkg.name, {
    id: pkg.id || pkg.name,
    url: pkg.url || `https://catalog.data.gov/dataset/${pkg.name}`,
    scoreHint: 4,
    description: pkg.notes || null,
    resources: (pkg.resources || []).slice(0, 5).map((r) => ({
      format: r.format || null,
      url: r.url || null,
    })),
    observedAt: pkg.metadata_modified || undefined,
  }));
}

async function fetchBexarParcels() {
  const params = new URLSearchParams({
    where: "1=1",
    outFields: "OBJECTID,Prop_ID,OWNER_NAME",
    returnGeometry: "false",
    resultRecordCount: "100",
    f: "json",
  });
  const data = await fetchWithTimeout(`https://services8.arcgis.com/FQqRYEf8oZEgwaX9/ArcGIS/rest/services/Bexar_County_Parcels/FeatureServer/0/query?${params}`);
  return (data?.features || []).map((feature) => signal("bexar-parcels", "property", feature.attributes?.OWNER_NAME || "Bexar parcel", {
    id: String(feature.attributes?.OBJECTID || feature.attributes?.Prop_ID || ""),
    location: "Bexar County, TX",
    scoreHint: 6,
    url: "https://services8.arcgis.com/FQqRYEf8oZEgwaX9/ArcGIS/rest/services/Bexar_County_Parcels/FeatureServer/0",
    record: feature.attributes || {},
  }));
}

async function fetchUSAspending() {
  const payload = {
    subawards: false,
    fields: ["Award ID", "Recipient Name", "Award Amount", "Description", "Start Date", "End Date", "Place of Performance City Code", "Place of Performance State Code"],
    filters: {
      time_period: [{ start_date: `${new Date().getUTCFullYear()}-01-01`, end_date: `${new Date().getUTCFullYear()}-12-31` }],
      place_of_performance_locations: [{ country: "USA", state: DEFAULT_STATE, city: DEFAULT_CITY }],
      award_type_codes: ["A", "B", "C", "D"],
    },
    page: 1,
    limit: 100,
    sort: "Award Amount",
    order: "desc",
  };
  const data = await fetchWithTimeout("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return (data?.results || []).map((row, index) => signal("usaspending", "federal-award", row["Description"] || row["Award ID"] || "Federal award", {
    id: row["Award ID"] || String(index),
    location: DEFAULT_CITY,
    url: row.generated_url || null,
    scoreHint: 45,
    amount: row["Award Amount"] || null,
    recipient: row["Recipient Name"] || null,
    awardId: row["Award ID"] || null,
    record: row,
  }));
}

async function fetchGrants() {
  const keywords = ["small business Texas", "construction Texas", "infrastructure San Antonio"];
  const signals = [];
  for (const keyword of keywords) {
    const data = await fetchWithTimeout("https://api.grants.gov/v1/api/search2", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ keyword }),
    });
    for (const row of data?.data || data?.results || []) {
      signals.push(signal("grantsgov", "grant-opportunity", row.title || row.opportunityTitle || keyword, {
        id: row.id || row.opportunityNumber || JSON.stringify(row).slice(0, 100),
        scoreHint: 35,
        url: row.url || row.link || null,
        record: row,
      }));
    }
  }
  return uniqueSignals(signals);
}

async function fetchFederalRegister() {
  const params = new URLSearchParams({
    per_page: "50",
    order: "newest",
    "conditions[term]": `${DEFAULT_STATE} ${DEFAULT_CITY} small business construction procurement`,
  });
  const data = await fetchWithTimeout(`https://www.federalregister.gov/api/v1/documents.json?${params}`);
  return (data?.results || []).map((row) => signal("federal-register", "regulatory-signal", row.title || "Federal Register document", {
    id: row.document_number || row.html_url,
    scoreHint: 18,
    url: row.html_url || null,
    observedAt: row.publication_date ? new Date(row.publication_date).toISOString() : undefined,
    record: row,
  }));
}

async function fetchCensus() {
  const year = process.env.CENSUS_YEAR || "2024";
  const params = new URLSearchParams({
    get: "NAME,B01003_001E,B19013_001E,B25001_001E",
    for: "place:65000",
    in: "state:48",
  });
  if (process.env.CENSUS_API_KEY) params.set("key", process.env.CENSUS_API_KEY);
  const data = await fetchWithTimeout(`https://api.census.gov/data/${year}/acs/acs5?${params}`);
  const rows = Array.isArray(data) ? data : [];
  if (rows.length < 2) return [];
  return [signal("census", "market-context", "San Antonio demographic and housing context", {
    id: `san-antonio-acs-${year}`,
    location: DEFAULT_CITY,
    scoreHint: 12,
    record: Object.fromEntries(rows[0].map((k, i) => [k, rows[1][i]])),
    url: `https://api.census.gov/data/${year}/acs/acs5`,
  })];
}

async function fetchBLS() {
  const series = (process.env.OPTIMIZE_BLS_SERIES || "LNS14000000").split(",").map((s) => s.trim()).filter(Boolean);
  const year = new Date().getUTCFullYear();
  const startYear = String(year - 1);
  const endYear = String(year);
  const data = await fetchWithTimeout("https://api.bls.gov/publicAPI/v2/timeseries/data/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ seriesid: series, startyear: startYear, endyear: endYear }),
  });
  return (data?.Results?.series || []).flatMap((item) =>
    (item.data || []).slice(0, 12).map((row) => signal("bls", "labor-market", `BLS ${item.seriesID} ${row.periodName}`, {
      id: `${item.seriesID}-${row.year}-${row.period}`,
      scoreHint: 10,
      record: row,
      url: "https://www.bls.gov/developers/",
    }))
  );
}

async function fetchNWS() {
  const point = await fetchWithTimeout(`https://api.weather.gov/points/${DEFAULT_LAT},${DEFAULT_LON}`);
  const alerts = await fetchWithTimeout("https://api.weather.gov/alerts/active?area=TX");
  const forecast = point?.properties?.forecast ? await fetchWithTimeout(point.properties.forecast) : null;
  const signals = [];
  for (const alert of alerts?.features || []) {
    const p = alert.properties || {};
    signals.push(signal("nws", "weather-alert", p.headline || p.event || "NWS alert", {
      id: p.id || alert.id,
      scoreHint: 30,
      location: DEFAULT_CITY,
      url: p.web || p.uri || null,
      record: p,
    }));
  }
  if (forecast?.properties?.periods?.[0]) {
    signals.push(signal("nws", "weather-context", "Current San Antonio forecast", {
      id: `forecast-${forecast.properties.periods[0].number}`,
      location: DEFAULT_CITY,
      scoreHint: 5,
      record: forecast.properties.periods[0],
      url: point?.properties?.forecast || null,
    }));
  }
  return signals;
}

async function fetchFEMA() {
  const params = new URLSearchParams({
    $top: "50",
    $orderby: "declarationDate desc",
    $filter: `state eq '${DEFAULT_STATE}'`,
  });
  const data = await fetchWithTimeout(`https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?${params}`);
  return (data?.DisasterDeclarationsSummaries || []).slice(0, 50).map((row) => signal("fema", "disaster", `${row.declarationTitle || "FEMA disaster"} — ${row.declarationDate || ""}`, {
    id: row.id || `${row.fipsStateCode}-${row.declarationDate}-${row.declarationNumber}`,
    location: row.declarationTitle || DEFAULT_STATE,
    scoreHint: 25,
    record: row,
    url: "https://www.fema.gov/openfema-data-page/disaster-declarations-summaries-v2",
  }));
}

async function fetchEPA() {
  const url = "https://data.epa.gov/efservice/FRS/STATE_CODE/TX/COUNTY_NAME/BEXAR/ROWS/1:50/JSON";
  const data = await fetchWithTimeout(url);
  return (Array.isArray(data) ? data : []).map((row, index) => signal("epa-envirofacts", "environmental-facility", row.FACILITY_NAME || "EPA facility", {
    id: row.REGISTRY_ID || row.FRS_FACILITY_ID || String(index),
    location: row.CITY_NAME || DEFAULT_CITY,
    scoreHint: 8,
    record: row,
    url,
  }));
}

async function fetchUSGS() {
  const data = await fetchWithTimeout("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson");
  return (data?.features || []).map((feature) => signal("usgs-earthquakes", "hazard", feature.properties?.title || "USGS earthquake", {
    id: feature.id,
    location: feature.properties?.place || null,
    scoreHint: Number(feature.properties?.mag || 0) >= 4 ? 18 : 5,
    url: feature.properties?.url || null,
    observedAt: feature.properties?.time ? new Date(feature.properties.time).toISOString() : undefined,
    record: feature.properties || {},
  }));
}

async function fetchUSGSWater() {
  const url = `https://api.waterdata.usgs.gov/ogcapi/v1/collections/monitoring-locations/items?bbox=${DEFAULT_LON - 0.5},${DEFAULT_LAT - 0.5},${DEFAULT_LON + 0.5},${DEFAULT_LAT + 0.5}&limit=50&f=json`;
  const data = await fetchWithTimeout(url);
  return (data?.features || []).map((feature) => signal("usgs-water", "water-monitoring", feature.properties?.name || "USGS monitoring location", {
    id: feature.id,
    location: feature.geometry?.coordinates || null,
    scoreHint: 4,
    record: feature.properties || {},
    url,
  }));
}

async function fetchOSM() {
  const bbox = [DEFAULT_LAT - 0.08, DEFAULT_LON - 0.08, DEFAULT_LAT + 0.08, DEFAULT_LON + 0.08].join(",");
  const query = `[out:json][timeout:25];(nwr["building"](around:9000,${DEFAULT_LAT},${DEFAULT_LON});nwr["shop"](around:9000,${DEFAULT_LAT},${DEFAULT_LON});nwr["amenity"](around:9000,${DEFAULT_LAT},${DEFAULT_LON}););out center tags;`;
  const data = await fetchWithTimeout("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  }, 20000);
  return (data?.elements || []).slice(0, 500).map((el) => signal("openstreetmap", "geospatial", el.tags?.name || el.tags?.building || el.tags?.shop || el.tags?.amenity || "OSM feature", {
    id: String(el.id),
    location: el.center ? [el.center.lat, el.center.lon] : null,
    scoreHint: 3,
    record: el.tags || {},
    url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
  }));
}

async function fetchGDELT() {
  const query = `"${DEFAULT_CITY}" "${DEFAULT_STATE}" (construction OR permit OR procurement OR expansion OR development OR renovation OR opening)`;
  const params = new URLSearchParams({
    query,
    mode: "artlist",
    format: "json",
    maxrecords: "50",
    timespan: "1week",
  });
  const data = await fetchWithTimeout(`https://api.gdeltproject.org/api/v2/doc/doc?${params}`);
  return (data?.articles || []).map((row, index) => signal("gdelt", "news-signal", row.title || "GDELT article", {
    id: row.url || String(index),
    scoreHint: 14,
    location: DEFAULT_CITY,
    url: row.url || null,
    observedAt: row.seendate || undefined,
    record: row,
  }));
}

async function fetchSEC() {
  const ciks = (process.env.OPTIMIZE_SEC_CIKS || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!ciks.length) return [];
  const ua = process.env.OPTIMIZE_USER_AGENT || "OPTIMIZE-PrimeForge/1.0 (open-data integration)";
  const output = [];
  for (const cik of ciks.slice(0, 10)) {
    const normalized = cik.replace(/\D/g, "").padStart(10, "0");
    const data = await fetchWithTimeout(`https://data.sec.gov/submissions/CIK${normalized}.json`, { headers: { "user-agent": ua } });
    for (const recent of data?.filings?.recent?.form || []) {
      output.push(signal("sec", "company-filing", `SEC ${recent}`, {
        id: `${normalized}-${recent}`,
        scoreHint: 16,
        url: `https://www.sec.gov/edgar/browse/?CIK=${normalized}`,
        record: data.filings.recent,
      }));
      break;
    }
  }
  return output;
}

async function fetchSanAntonioArcGIS() {
  const directoryUrl = "https://services.arcgis.com/g1fRTDLeMgspWrYp/ArcGIS/rest/services?f=pjson";
  const directory = await fetchWithTimeout(directoryUrl);
  const services = Array.isArray(directory?.services) ? directory.services : [];
  const patterns = [
    /311/i, /permit/i, /vacant/i, /demolition/i, /pipeline/i, /project/i,
    /pavement/i, /sidewalk/i, /drainage/i, /storm/i, /street/i, /ROW/i,
    /risk/i, /opportunityzone/i, /landuse/i, /flood/i, /neighborhood/i,
    /construction/i, /facade/i, /mow/i
  ];
  const selected = services
    .filter((service) => service?.name && patterns.some((pattern) => pattern.test(service.name)))
    .slice(0, 30);

  const signals = [];
  for (const service of selected) {
    const type = service.type || "FeatureServer";
    const base = `https://services.arcgis.com/g1fRTDLeMgspWrYp/ArcGIS/rest/services/${encodeURIComponent(service.name)}/${type}`;
    try {
      const metadata = await fetchWithTimeout(`${base}?f=pjson`);
      const layers = Array.isArray(metadata?.layers) ? metadata.layers : [];
      const tables = Array.isArray(metadata?.tables) ? metadata.tables : [];
      const targets = [...layers, ...tables].slice(0, 3);
      if (!targets.length && metadata?.name) {
        signals.push(signal("sanantonio-arcgis", "local-gis-discovery", metadata.name, {
          id: metadata.serviceItemId || service.name,
          scoreHint: 10,
          url: base,
          record: { service: metadata.name, type, description: metadata.description || null }
        }));
        continue;
      }

      for (const layer of targets) {
        const layerUrl = `${base}/${layer.id}/query`;
        const params = new URLSearchParams({
          where: "1=1",
          outFields: "*",
          returnGeometry: "false",
          resultRecordCount: "50",
          f: "json",
        });
        try {
          const result = await fetchWithTimeout(`${layerUrl}?${params}`);
          const features = Array.isArray(result?.features) ? result.features : [];
          signals.push(signal("sanantonio-arcgis", "local-gis-layer", layer.name || metadata.name, {
            id: `${service.name}:${layer.id}`,
            location: DEFAULT_CITY,
            scoreHint: Math.min(40, 10 + features.length),
            url: layerUrl,
            recordCount: features.length,
            fields: (layer.fields || metadata.fields || []).slice(0, 30).map((f) => f.name || f.alias),
            sample: features.slice(0, 20).map((f) => f.attributes || f),
          }));
        } catch {
          // Metadata discovery is retained if the layer query is not publicly readable.
          signals.push(signal("sanantonio-arcgis", "local-gis-discovery", layer.name || metadata.name, {
            id: `${service.name}:${layer.id}`,
            scoreHint: 7,
            url: layerUrl,
            recordCount: null,
            fields: (layer.fields || []).slice(0, 30).map((f) => f.name || f.alias),
          }));
        }
      }
    } catch {
      // Continue through the directory; individual services can fail independently.
    }
  }
  return uniqueSignals(signals);
}

async function fetchSAMOpportunities() {
  const key = process.env.SAM_API_KEY;
  if (!key) return [];
  const now = new Date();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 30);
  const fmt = (d) => `${String(d.getUTCMonth()+1).padStart(2,"0")}/${String(d.getUTCDate()).padStart(2,"0")}/${d.getUTCFullYear()}`;
  const keywords = (process.env.OPTIMIZE_SAM_KEYWORDS || "construction,facilities,maintenance,repair,HVAC,landscaping")
    .split(",").map((x) => x.trim()).filter(Boolean);

  const signals = [];
  for (const keyword of keywords.slice(0, 10)) {
    const params = new URLSearchParams({
      api_key: key,
      limit: "100",
      offset: "0",
      postedFrom: fmt(start),
      postedTo: fmt(now),
      state: DEFAULT_STATE,
      ptype: "o",
      keyword,
    });
    try {
      const data = await fetchWithTimeout(`https://api.sam.gov/opportunities/v2/search?${params}`);
      for (const row of data?.opportunitiesData || []) {
        signals.push(signal("sam-opportunities", "federal-contract-opportunity", row.title || row.noticeId || keyword, {
          id: row.noticeId || row.packageId || JSON.stringify(row).slice(0, 100),
          scoreHint: 60,
          location: row.placeOfPerformance?.state || DEFAULT_STATE,
          url: row.uiLink || row.link || null,
          record: row,
        }));
      }
    } catch (error) {
      signals.push(signal("sam-opportunities", "source-health", `SAM.gov query failed for ${keyword}`, {
        id: `sam-error-${keyword}`,
        scoreHint: 0,
        record: { error: error.message },
      }));
    }
  }
  return uniqueSignals(signals);
}

const FETCHERS = {
  "sanantonio-ckan": fetchSanAntonioRecords,
  "texas-socrata": fetchTexasRecords,
  "sanantonio-arcgis": fetchSanAntonioArcGIS,
  "sam-opportunities": fetchSAMOpportunities,
  "datagov-catalog": fetchDataGov,
  "bexar-parcels": fetchBexarParcels,
  "usaspending": fetchUSAspending,
  "grantsgov": fetchGrants,
  "federal-register": fetchFederalRegister,
  "sec": fetchSEC,
  "census": fetchCensus,
  "bls": fetchBLS,
  "nws": fetchNWS,
  "fema": fetchFEMA,
  "epa-envirofacts": fetchEPA,
  "usgs-earthquakes": fetchUSGS,
  "usgs-water": fetchUSGSWater,
  "openstreetmap": fetchOSM,
  "gdelt": fetchGDELT,
};

async function collectOpenSourceSignals({ sourceIds = [], concurrency = 4 } = {}) {
  const requested = sourceIds.length ? sourceIds : SOURCE_REGISTRY.map((s) => s.id);
  const selected = SOURCE_REGISTRY.filter((s) => requested.includes(s.id));
  const health = [];
  const signals = [];

  for (let i = 0; i < selected.length; i += concurrency) {
    const batch = selected.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map(async (source) => ({ source, data: await FETCHERS[source.id]() }))
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        health.push({ id: result.value.source.id, status: "ok", count: result.value.data.length });
        signals.push(...result.value.data);
      } else {
        const source = batch[results.indexOf(result)];
        health.push({ id: source.id, status: "error", error: result.reason?.message || String(result.reason) });
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    geography: { city: DEFAULT_CITY, state: DEFAULT_STATE, lat: DEFAULT_LAT, lon: DEFAULT_LON },
    sources: health,
    registry: SOURCE_REGISTRY,
    signals: uniqueSignals(signals),
  };
}

module.exports = { SOURCE_REGISTRY, collectOpenSourceSignals, fetchWithTimeout };
