const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;
const dotenv = require("dotenv");
dotenv.config();
// mongodb
const { MongoClient, ServerApiVersion } = require("mongodb");
const { error } = require("console");
const uri = `mongodb+srv://${process.env.MongoDb_name}:${process.env.MongoDb_pass}@cluster0.we4ne2s.mongodb.net/?appName=Cluster0`;
app.use(cors());
app.use(express.json());
app.get("/", (req, res) => {
  res.send("This is home");
});
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    await client.connect();
    const db = client.db("TicketBari");
    const ticketsCollection = db.collection("tickets");
    app.get("/tickets", async (req, res) => {
      const mail = req.query.email;
      const result = await ticketsCollection.find({ email: mail }).toArray();
      res.send(result);
    });
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } catch {
    (err) => console.log(err);
  }
}
run();
app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
