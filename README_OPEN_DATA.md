# OPTIMIZE open-data acquisition layer

OPTIMIZE now treats open APIs as a first-class acquisition fabric for Opportunity Radar.

## Live sources wired

### Local / regional
- City of San Antonio Open Data (CKAN catalog + Datastore records when available)
- Texas Open Data Portal (Socrata catalog + public dataset reads)
- Bexar County parcel GIS (ArcGIS FeatureServer)
- Data.gov catalog discovery

### Federal / economic
- USAspending
- Grants.gov
- Federal Register
- SEC EDGAR
- Census ACS
- BLS public API

### Environment / hazards
- National Weather Service
- OpenFEMA
- EPA Envirofacts
- USGS Earthquake feeds
- USGS modern water APIs

### Geospatial / news
- OpenStreetMap Overpass
- GDELT DOC 2.0

## Endpoints

- GET /api/radar/sources — source registry and authentication class
- GET /api/radar/open-data — fetch the source fabric and return normalized signals
- GET /api/radar/open-data?sources=usaspending,grantsgov,gdelt — run selected connectors

Every source is isolated. One unavailable API does not prevent the others from returning data.

## Credentials

Token-free sources run immediately.

Some public/open APIs support or require optional registration/keys for higher limits or specific access:
- Census API key
- BLS v2 registration
- SAM.gov API key (planned adapter; official public opportunity API/data-service access remains governed by SAM.gov terms)
- USGS higher-rate API key
- SEC requires an identifying User-Agent but not an API key

Do not commit credentials.

## Opportunity Radar normalization

All connectors return a common signal shape:
sourceId, category, title, observedAt, location, url, scoreHint, details.

The next layer can dedupe, enrich, score, and map these signals against Jobber work history.
