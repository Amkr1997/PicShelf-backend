const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config({ path: ".env" });

const initializeDatabase = async () => {
  try {
    const dbConnect = await mongoose.connect(process.env.MONGO_URI);

    if (dbConnect) console.log("Connected to mongoDB");
  } catch (error) {
    console.log(error);
  }
};

module.exports = { initializeDatabase };
