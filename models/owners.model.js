const mongoose = require("mongoose");

const ownerSchema = new mongoose.Schema({
  googleId: {
    type: String,
    required: true,
    unique: true,
  },

  email: {
    type: String,
    required: true,
  },
});

const Owner = mongoose.model("Owner", ownerSchema);
module.exports = Owner;
