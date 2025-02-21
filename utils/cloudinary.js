const { v2: cloudinary } = require("cloudinary");
const fs = require("fs");
require("dotenv").config({ path: ".env" });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadCloudinary = async (picture) => {
  try {
    if (!picture) return "picture not found";

    const response = await cloudinary.uploader.upload(picture, {
      folder: "kaviosPix",
    });

    fs.unlinkSync(picture);
    return response;
  } catch (error) {
    fs.unlinkSync(response);
    console.log("Error while uploading to cloudinary", error);
  }
};

module.exports = { uploadCloudinary };
