/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_102036695")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX `idx_chat_slug` ON `chat_messages` (`slug`)",
      "CREATE INDEX `idx_chat_thread_created` ON `chat_messages` (`slug`,`thread`,`created`)"
    ],
    "listRule": "@request.query.slug != \"\" && slug = @request.query.slug",
    "viewRule": "@request.query.slug != \"\" && slug = @request.query.slug"
  }, collection)

  // add field
  collection.fields.addAt(6, new Field({
    "hidden": false,
    "id": "autodate2990389176",
    "name": "created",
    "onCreate": true,
    "onUpdate": false,
    "presentable": false,
    "system": false,
    "type": "autodate"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_102036695")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX `idx_chat_slug` ON `chat_messages` (`slug`)"
    ],
    "listRule": null,
    "viewRule": null
  }, collection)

  // remove field
  collection.fields.removeById("autodate2990389176")

  return app.save(collection)
})
