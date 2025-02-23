const mongoose = require("mongoose");

const albumSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Owner",
    required: true,
  },

  name: {
    type: String,
    required: true,
  },

  description: {
    type: String,
  },

  imageId: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PicShelfImg",
      required: true,
    },
  ],

  sharedUsers: [
    {
      type: String,
    },
  ],
});

const Album = mongoose.model("PicAlbum", albumSchema);
module.exports = { Album };
