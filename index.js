const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;
const dotenv = require("dotenv");
dotenv.config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
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
    const paymentCollection = db.collection("payments");
    // all tickets api
    app.get("/tickets", async (req, res) => {
      const mail = req.query.email;
      if (mail) {
        const result = await ticketsCollection.find({ email: mail }).toArray();
        res.send(result);
      } else {
        const result = await ticketsCollection.find().toArray();
        res.send(result);
      }
    });

    // post ticket api
    app.post("/tickets", async (req, res) => {
      const ticket = req.body;
      const result = await ticketsCollection.insertOne(ticket);
      res.send(result);
    });

    // vendor ticket get api
    app.get("/tickets/vendor", async (req, res) => {
      const email = req.query.email;
      const result = await ticketsCollection
        .find({ vendorEmail: email })
        .sort({ createdAt: -1 })
        .toArray();
      res.send(result);
    });

    // update ticket api
    app.put("/tickets/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const data = req.body;

      const updateDoc = {
        $set: data,
      };

      const result = await ticketsCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // delete ticket api
    app.delete("/tickets/:id", async (req, res) => {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ error: "Invalid ticket id" });
      }

      const result = await ticketsCollection.deleteOne({
        _id: new ObjectId(id),
      });

      if (!result.deletedCount) {
        return res.status(404).send({ message: "Ticket not found" });
      }

      res.send({ success: true, message: "Ticket deleted successfully" });
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

    //approve or reject ticket
    app.patch("/tickets/:id/:action", async (req, res) => {
      const { id, action } = req.params;
      const query = { _id: new ObjectId(id) };
      const newStatus =
        action === "approve"
          ? "approved"
          : action === "reject"
          ? "rejected"
          : "pending";

      const result = await ticketsCollection.updateOne(query, {
        $set: { verificationStatus: newStatus },
      });
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
        paymentStatus: "unpaid",
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
              paymentStatus: 1,
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

    // vendor booking ticket view api
    app.get("/vendor/bookings", async (req, res) => {
      const email = req.query.vendorEmail;

      const bookings = await bookingsCollection
        .aggregate([
          {
            $addFields: { tId: { $toObjectId: "$ticketId" } },
          },
          {
            $lookup: {
              from: "tickets",
              localField: "tId",
              foreignField: "_id",
              as: "ticketInfo",
            },
          },
          { $unwind: "$ticketInfo" },
          { $match: { "ticketInfo.vendorEmail": email } },
          {
            $project: {
              userEmail: 1,
              bookingQuantity: 1,
              status: 1,
              totalPrice: {
                $multiply: ["$bookingQuantity", "$ticketInfo.pricePerUnit"],
              },
              title: "$ticketInfo.title",
              pricePerUnit: "$ticketInfo.pricePerUnit",
            },
          },
        ])
        .toArray();

      res.send(bookings);
    });

    // vendor accept and reject api
    app.patch("/bookings/:id/accept", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id))
        return res.status(400).send({ message: "Invalid booking id" });

      const result = await bookingsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "accepted" } }
      );

      res.send(result);
    });

    // revenue api
    app.get("/vendor/revenue", async (req, res) => {
      const email = req.query.vendorEmail;
      if (!email)
        return res.status(400).send({ error: "Vendor email is required" });

      const summary = await bookingsCollection
        .aggregate([
          {
            $addFields: { tId: { $toObjectId: "$ticketId" } },
          },
          {
            $lookup: {
              from: "tickets",
              localField: "tId",
              foreignField: "_id",
              as: "ticketInfo",
            },
          },
          { $unwind: "$ticketInfo" },
          {
            $match: {
              "ticketInfo.vendorEmail": email,
              paymentStatus: "paid",
            },
          },
          {
            $group: {
              _id: null,
              totalRevenue: {
                $sum: {
                  $multiply: ["$bookingQuantity", "$ticketInfo.pricePerUnit"],
                },
              },
              totalSold: { $sum: "$bookingQuantity" },
            },
          },
        ])
        .toArray();

      // vendor এর total tickets count
      const totalTicketsAdded = await ticketsCollection.countDocuments({
        vendorEmail: email,
      });

      res.send({
        totalRevenue: summary[0]?.totalRevenue || 0,
        totalTicketsSold: summary[0]?.totalSold || 0,
        totalTicketsAdded,
      });
    });

    app.patch("/bookings/:id/reject", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id))
        return res.status(400).send({ message: "Invalid booking id" });

      const result = await bookingsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "rejected" } }
      );

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

    // get user api
    app.get("/users", async (req, res) => {
      const email = req.query.email;
      if (email) {
        const result = await usersCollection.find({ email: email }).toArray();
        res.send(result);
      } else {
        const result = await usersCollection.find().toArray();
        res.send(result);
      }
    });

    // make admin api
    app.patch("/users/:id/make-admin", async (req, res) => {
      const id = req.params.id;
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role: "admin" } }
      );
      const updatedUser = await usersCollection.findOne({
        _id: new ObjectId(id),
      });
      res.send(updatedUser);
    });

    // make vendor api
    app.patch("/users/:id/make-vendor", async (req, res) => {
      const id = req.params.id;
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role: "vendor" } }
      );
      const updatedUser = await usersCollection.findOne({
        _id: new ObjectId(id),
      });
      res.send(updatedUser);
    });

    // mark fraud api
    app.patch("/users/:id/mark-fraud", async (req, res) => {
      const id = req.params.id;

      const vendor = await usersCollection.findOne({ _id: new ObjectId(id) });

      if (!vendor) {
        return res.status(404).send({ message: "Vendor not found" });
      }

      if (vendor.role !== "vendor") {
        return res
          .status(400)
          .send({ message: "Only vendor users can be marked as fraud." });
      }

      const userResult = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { isFraud: true } }
      );

      const hideTickets = await ticketsCollection.updateMany(
        { vendorEmail: vendor.email },
        { $set: { isHidden: true } }
      );

      res.send({
        modifiedCount: userResult.modifiedCount + hideTickets.modifiedCount,
        message: "Vendor marked as fraud; tickets hidden.",
        userUpdated: userResult.modifiedCount,
        ticketsHidden: hideTickets.modifiedCount,
      });
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
        success_url: `${process.env.CLIENT_URL}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.CLIENT_URL}/dashboard/payment-cancel?canceled=true`,
        metadata: { bookingId: bookingId, title: ticket.title },
        customer_email: booking.userEmail,
      });

      res.send({ url: session.url });
    });

    // update payment
    app.patch("/payment-success", async (req, res) => {
      const session_id = req.query.session_id;
      const session = await stripe.checkout.sessions.retrieve(session_id);

      if (session.payment_status === "paid") {
        const id = session.metadata.bookingId;
        const query = { _id: new ObjectId(id) };
        const transactionId = session.payment_intent;

        const alreadyPaid = await paymentCollection.findOne({ transactionId });
        if (alreadyPaid) {
          return res.send({
            paymentResult: alreadyPaid,
          });
        }

        const update = {
          $set: {
            paymentStatus: "paid",
          },
        };

        const result = await bookingsCollection.updateOne(query, update);

        const payment = {
          amount: session.amount_total / 100,
          currency: session.currency,
          customerEmail: session.customer_email,
          bookingId: session.metadata.bookingId,
          title: session.metadata.title,
          transactionId: session.payment_intent,
          paymentStatus: session.payment_status,
          paidAt: new Date(),
        };

        const resultPayment = await paymentCollection.insertOne(payment);
        const savedPayment = await paymentCollection.findOne({
          _id: resultPayment.insertedId,
        });

        const booking = await bookingsCollection.findOne(query);
        if (booking) {
          const ticketId = booking.ticketId;
          const qty = parseInt(booking.bookingQuantity);
          if (ticketId && qty > 0) {
            await ticketsCollection.updateOne(
              { _id: new ObjectId(ticketId) },
              { $inc: { quantity: -qty } }
            );
          }
        }

        return res.send({
          result,
          paymentResult: savedPayment,
          resultPayment,
        });
      }

      res.send({ message: "Payment not completed" });
    });
    app.get("/payment-success", async (req, res) => {
      const mail = req.query.email;

      const result = await paymentCollection
        .find({ customerEmail: mail })
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
