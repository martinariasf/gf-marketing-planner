/// <reference path="../pb_data/types.d.ts" />
// GF-130 — allow video in the inspiration asset store.
//
// The `file` field was created images-only (png/jpeg/webp/gif) with a 15 MB
// cap, so every video upload through POST /clients/:slug/inspiration was
// rejected by PocketBase itself and surfaced as a 502 "Upload failed" — the
// actual cause of "manual video upload not working in the content calendar".
// The API-side cap agreed for GF-130 is 100 MB for video, which PB must also
// permit or the API's own check is unreachable.
//
// The three video types match exactly what assetFiles.ts can serve back with a
// correct Content-Type (mp4 / webm / mov); adding more here would store bytes
// the serving layer cannot label.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2737155904")

  collection.fields.removeById("file2359244304")
  collection.fields.addAt(3, new Field({
    "hidden": false,
    "id": "file2359244304",
    "maxSelect": 1,
    "maxSize": 100000000,
    "mimeTypes": [
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
      "video/mp4",
      "video/webm",
      "video/quicktime"
    ],
    "name": "file",
    "presentable": false,
    "protected": false,
    "required": true,
    "system": false,
    "thumbs": null,
    "type": "file"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2737155904")

  collection.fields.removeById("file2359244304")
  collection.fields.addAt(3, new Field({
    "hidden": false,
    "id": "file2359244304",
    "maxSelect": 1,
    "maxSize": 15000000,
    "mimeTypes": [
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif"
    ],
    "name": "file",
    "presentable": false,
    "protected": false,
    "required": true,
    "system": false,
    "thumbs": null,
    "type": "file"
  }))

  return app.save(collection)
})
