const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;
const dotenv = require("dotenv");
dotenv.config();
// mongodb
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
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
    const bookingsCollection = db.collection("bookings");

    // all tickets api
    app.get("/tickets", async (req, res) => {
      const mail = req.query.email;
      const result = await ticketsCollection.find({ email: mail }).toArray();
      res.send(result);
    });

    // advertise api
    app.get("/tickets/advertised", async (req, res) => {
      const query = { verificationStatus: "approved", isAdvertised: true };
      const result = await ticketsCollection
        .find(query)
        .limit(6)
        .sort({
          createdAt: -1,
        })
        .toArray();

      res.send(result);
    });

    // latest api
    app.get("/tickets/latest-tickets", async (req, res) => {
      const query = { verificationStatus: "approved" };
      const result = await ticketsCollection
        .find(query)
        .limit(8)
        .sort({
          createdAt: -1,
        })
        .toArray();

      res.send(result);
    });

    // single Ticket Details api
    app.get("/tickets/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await ticketsCollection.findOne(query);

      res.send(result);
    });

    // post booking api
    app.post("/bookings", async (req, res) => {
      const booking = req.body;
      const ticket = await ticketsCollection.findOne({
        _id: new ObjectId(booking.ticketId),
      });
      if (!ticket) return res.send({ message: "ticket not found" });
      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    });

    // get booked tickets api
    app.get("/bookings", async (req, res) => {
      const email = req.query.email;

      const result = await bookingsCollection
        .aggregate([
          { $match: { userEmail: email } },
          {
            $addFields: {
              tId: { $toObjectId: "$ticketId" },
              bookingQuantity: { $toInt: "$bookingQuantity" },
            },
          },
          {
            $lookup: {
              from: "tickets",
              localField: "tId",
              foreignField: "_id",
              as: "t",
            },
          },

          { $unwind: "$t" },
          {
            $group: {
              _id: "$ticketId",
              bookingQuantity: { $sum: "$bookingQuantity" },
              unitPrice: { $first: { $toDouble: "$t.pricePerUnit" } },
              status: { $first: "$status" },
              ticketTitle: { $first: "$t.title" },
              imageURL: { $first: "$t.imageURL" },
              from: { $first: "$t.from" },
              to: { $first: "$t.to" },
              departureDateTime: { $first: "$t.departureDateTime" },
            },
          },
          {
            $project: {
              _id: 0,
              ticketId: "$_id",
              bookingQuantity: 1,
              unitPrice: 1,
              status: 1,
              ticketTitle: 1,
              imageURL: 1,
              from: 1,
              to: 1,
              departureDateTime: 1,
            },
          },
        ])
        .toArray();

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
