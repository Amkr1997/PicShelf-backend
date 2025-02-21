const mongoose = require("mongoose");

const imageSchema = new mongoose.Schema(
  {
    albumId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PicAlbum",
      required: true,
    },

    imageName: {
      type: String,
      required: true,
    },

    tags: [
      {
        type: String,
      },
    ],

    persons: [
      {
        type: String,
      },
    ],

    isFav: {
      type: Boolean,
    },

    comments: [
      {
        type: String,
      },
    ],

    size: {
      type: String,
    },
  },
  { timestamps: true }
);

const Image = mongoose.model("PicShelfImg", imageSchema);
module.exports = { Image };
