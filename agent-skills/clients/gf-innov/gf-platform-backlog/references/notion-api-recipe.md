# Notion API recipe — GF Platform Backlog

Quick reference for the raw HTTP calls. Data source ID:
`377ae4b1-247e-81f9-ac36-000b8455942d`. Header `Notion-Version: 2025-09-03`.

## Find the backlog (if the ID ever changes)

```bash
: "${GF_NOTION_TOKEN:?export GF_NOTION_TOKEN first (never hardcode it)}"
curl -s -X POST "https://api.notion.com/v1/search" \
  -H "Authorization: Bearer $GF_NOTION_TOKEN" \
  -H "Notion-Version: 2025-09-03" \
  -H "Content-Type: application/json" \
  -d '{"query":""}'
```
Look for the `data_source` object named "GF Platform Backlog — marketing.gfinnov.com".

## Re-read the property schema + valid select options

```bash
DS="377ae4b1-247e-81f9-ac36-000b8455942d"
curl -s "https://api.notion.com/v1/data_sources/$DS" \
  -H "Authorization: Bearer $GF_NOTION_TOKEN" \
  -H "Notion-Version: 2025-09-03" \
  | /opt/hermes/.venv/bin/python3 -c "
import sys,json
d=json.load(sys.stdin); props=d.get('properties',{})
for name in ['Status','Type','Priority','Area','Proposed by','Estimate']:
    opts=props.get(name,{}).get('select',{}).get('options',[])
    print(f'{name}:', [o['name'] for o in opts])
"
```
Run this whenever you're unsure a select value still exists — options can be
added/renamed on the Notion side.

## List existing rows (dedupe before adding)

```bash
DS="377ae4b1-247e-81f9-ac36-000b8455942d"
curl -s -X POST "https://api.notion.com/v1/data_sources/$DS/query" \
  -H "Authorization: Bearer $GF_NOTION_TOKEN" \
  -H "Notion-Version: 2025-09-03" \
  -H "Content-Type: application/json" \
  -d '{"page_size":100}' \
  | /opt/hermes/.venv/bin/python3 -c "
import sys,json
d=json.load(sys.stdin)
for r in d['results']:
    t=r['properties']['Name']['title']; name=t[0]['plain_text'] if t else '(sin titulo)'
    st=r['properties']['Status']['select']; st=st['name'] if st else '-'
    ty=r['properties']['Type']['select']; ty=ty['name'] if ty else '-'
    print(f'[{ty}|{st}] {name}')
"
```

## Create a row

POST `https://api.notion.com/v1/pages` with body
`{"parent":{"type":"data_source_id","data_source_id":DS},"properties":{...}}`.
See `scripts/add_backlog_items.py` for the property shapes. A successful
create returns an object with `"object":"page"`.
