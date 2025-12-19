const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;
const dotenv = require("dotenv");
dotenv.config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
// mongodb
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
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
    const usersCollection = db.collection("users");

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
      if (!ticket) return res.status(404).send({ message: "Ticket not found" });
      const existingBooking = await bookingsCollection.findOne({
        userEmail: booking.userEmail,
        ticketId: booking.ticketId,
        status: "pending",
      });
      if (existingBooking) {
        const updated = await bookingsCollection.updateOne(
          { _id: existingBooking._id },
          { $inc: { bookingQuantity: Number(booking.bookingQuantity) } }
        );
        return res.send({ message: "Booking quantity updated", updated });
      }
      const result = await bookingsCollection.insertOne({
        ...booking,
        bookingQuantity: Number(booking.bookingQuantity),
        status: "pending",
        createdAt: new Date(),
      });

      res.send({ message: "Booking created", result });
    });

    // get booked tickets api
    app.get("/bookings", async (req, res) => {
      const email = req.query.email;

      const result = await bookingsCollection
        .aggregate([
          { $match: { userEmail: email } },
          { $addFields: { tId: { $toObjectId: "$ticketId" } } },
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
            $project: {
              bookingQuantity: 1,
              status: 1,
              ticketTitle: "$t.title",
              imageURL: "$t.imageURL",
              from: "$t.from",
              to: "$t.to",
              departureDateTime: "$t.departureDateTime",
              unitPrice: "$t.pricePerUnit",
            },
          },
        ])
        .toArray();

      res.send(result);
    });

    //user api
    app.post("/users", async (req, res) => {
      const user = req.body;
      const existingUser = await usersCollection.findOne({ email: user.email });
      if (existingUser) {
        return res.send({ message: "User already exists" });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // payment api
    app.post("/create-checkout-session", async (req, res) => {
      const { bookingId } = req.body;

      const booking = await bookingsCollection.findOne({
        _id: new ObjectId(bookingId),
      });
      if (!booking)
        return res.status(404).send({ message: "Booking not found" });

      const ticket = await ticketsCollection.findOne({
        _id: new ObjectId(booking.ticketId),
      });
      if (!ticket) return res.status(404).send({ message: "Ticket not found" });

      const qty = parseInt(booking.bookingQuantity);
      const unitPrice = parseInt(ticket.pricePerUnit);

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "bdt",
              product_data: { name: ticket.title },
              unit_amount: unitPrice * 100,
            },
            quantity: qty,
          },
        ],
        success_url: `${process.env.CLIENT_URL}/dashboard/my-booked-tickets?success=true`,
        cancel_url: `${process.env.CLIENT_URL}/dashboard/my-booked-tickets?canceled=true`,
        metadata: { bookingId: bookingId },
      });

      res.send({ url: session.url });
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
