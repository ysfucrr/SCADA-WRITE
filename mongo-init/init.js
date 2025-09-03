// mongo-init/init.js
db = db.getSiblingDB('admin');
db.auth('scadaDashboardUser', '9Ziy5gxcGMWKKPJ9');

rs.initiate({
  _id: "rs0",
  members: [{ _id: 0, host: "localhost:27017" }]
});