const { initializeDatabase } = require("./db/db.connect");
const Owner = require("./models/owners.model");
initializeDatabase();

const path = require("path");
const express = require("express");
const cors = require("cors");
require("dotenv").config({ path: ".env" });
const app = express();
const jwt = require("jsonwebtoken");
const axios = require("axios");
const multer = require("multer");
const { uploadCloudinary } = require("./utils/cloudinary");
const { Album } = require("./models/album.model");
const { Image } = require("./models/image.model");

const corsOptions = {
  origin: ["http://localhost:5173"],
  credentials: true,
  openSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json());

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // const assetsPath = path.resolve(__dirname, "assets");
    return cb(null, "/tmp");
  },

  filename: function (req, file, cb) {
    return cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage, limits: { fieldSize: 5 * 1024 * 1024 } });

app.get("/", (req, res) => {
  res.send("Express Started");
});

app.get("/auth/google", (req, res) => {
  res.redirect(
    `https://accounts.google.com/o/oauth2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${process.env.BACKEND_URL}/auth/google/callback&response_type=code&scope=profile email`
  );
});

app.get("/auth/google/callback", async (req, res) => {
  const { code } = req.query;

  if (!code) return res.status(400).send("Authorization code not provided");

  let accessToken;
  try {
    const tokenRes = await axios.post(
      `https://oauth2.googleapis.com/token`,
      {
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${process.env.BACKEND_URL}/auth/google/callback`,
      },
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    accessToken = tokenRes.data.access_token;

    const googleUserResponse = await axios.get(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const { id, email, name } = googleUserResponse.data;

    const alreadyOwner = await Owner.findOne({ googleId: id });

    let jwtToken;
    if (!alreadyOwner) {
      const newOwner = new Owner({ googleId: id, email, name });
      await newOwner.save();

      jwtToken = jwt.sign(
        { googleId: id, name, email, mongoId: newOwner._id },
        process.env.JWT_SECRET_KEY,
        {
          expiresIn: "24h",
        }
      );
    } else {
      jwtToken = jwt.sign(
        { googleId: id, name, email, mongoId: alreadyOwner._id },
        process.env.JWT_SECRET_KEY,
        {
          expiresIn: "24h",
        }
      );
    }

    return res.redirect(
      `${process.env.FRONTEND_URL}/register?token=${jwtToken}`
    );
  } catch (error) {
    return res
      .status(500)
      .json({ error: "Failed to fetch access token from Google." });
  }
});

const verifyJWT = (req, res, next) => {
  const token = req.headers["authorization"];

  if (!token) res.status(401).json({ message: "No Token provided" });

  try {
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET_KEY);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.log(error);
    return res.status(401).json({ message: "Invalid Token" });
  }
};

app.get("/get/profile", verifyJWT, async (req, res) => {
  res.json({ message: "Welcome to protected route", user: req.user });
});

// Upload Image
app.post(
  "/add/image/album/:albumId",
  upload.fields([{ name: "imageName", maxCount: 1 }]),
  async (req, res) => {
    const albumId = req.params.albumId;
    const imageData = req.body;

    try {
      const alreadyAlbum = await Album.findById(albumId);
      if (!alreadyAlbum) {
        return res.status(400).json({ message: "Album not found" });
      }

      const imgLocalPath = req.files?.imageName?.[0]?.path;

      if (!imgLocalPath) {
        return res.status(400).json({ message: "Image not added" });
      }

      const postedImg = await uploadCloudinary(imgLocalPath);

      if (!postedImg) {
        return res.status(400).json({ message: "Image not added" });
      }

      const newImg = new Image({
        ...imageData,
        albumId,
        imageName: postedImg.secure_url,
        size: postedImg.bytes,
      });

      const savedImg = await newImg.save();
      if (!savedImg)
        return res.status(404).json({ message: "Image not saved" });

      const updatedAlbum = await Album.findByIdAndUpdate(
        albumId,
        {
          $addToSet: { imageId: newImg._id },
        },
        { new: true }
      );

      if (!updatedAlbum) {
        await Image.findByIdAndDelete(newImg._id);

        return res.status(500).json({
          message: "Failed to update image album",
        });
      }

      return res.status(200).json({ message: "Image added", savedImg });
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Get Images
app.get("/get/all/images", async (req, res) => {
  try {
    const allImages = await Image.find();

    if (!allImages) {
      return res.status(404).json({ message: "Cannot find images" });
    }

    return res.status(200).json(allImages);
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Get Image by fav
app.get("/get/all/images/fav", async (req, res) => {
  try {
    const allFavImages = await Image.find({ isFav: true });

    if (!allFavImages)
      return res.status(404).json({ message: "Cannot find images" });

    return res.status(200).json(allFavImages);
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/get/single/image/:id", async (req, res) => {
  const imageId = req.params.id;

  try {
    const singleImg = await Image.findById(imageId);

    if (!singleImg)
      return res.status(404).json({ message: "Cannot find the image" });

    return res.status(200).json(singleImg);
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Get Images by Tags
app.get("/albums/:albumId/images", async (req, res) => {
  const { tags } = req.query;

  let filter = {};
  if (tags) {
    const allTags = Array.isArray(tags) ? tags : tags.split(",");
    filter.tags = { $in: allTags };
  }

  try {
    const imagesByTags = await Image.find(filter);

    if (!imagesByTags) {
      return res.status(404).json({ message: "No Image with found" });
    }

    return res.status(200).json(imagesByTags);
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Update Image (isFav, comment, tags)
app.post("/update/albums/:albumId/images/:imageId", async (req, res) => {
  const albumId = req.params.albumId;
  const imageId = req.params.imageId;
  const dataToUpdate = req.body;

  try {
    const alreadyAlbum = await Album.findById(albumId);

    if (!alreadyAlbum) {
      return res.status(404).json({ message: "Cannot find album" });
    }

    const alreadyImage = await Image.findById(imageId);

    if (!alreadyImage) {
      return res.status(404).json({ message: "Cannot find image" });
    }

    const imgToUpdate = await Image.find({ albumId });

    if (!imgToUpdate)
      return res.status(500).json({ message: "Album not matching" });

    const updatedImgData = await Image.findByIdAndUpdate(
      imageId,
      dataToUpdate,
      { new: true }
    );

    if (!updatedImgData) {
      return res.status(404).json({ message: "Cannot update image" });
    }

    return res
      .status(200)
      .json({ message: "Image got updated", updatedImgData });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Delete Image
app.delete(
  "/delete/user/:userId/album/:albumId/image/:imageId",
  async (req, res) => {
    const userId = req.params.userId;
    const imageId = req.params.imageId;
    const albumId = req.params.albumId;

    try {
      const album = await Album.findById(albumId);
      const owner = await Owner.findById(userId);
      const image = await Image.findById(imageId);

      if (!owner || !album) {
        return res.status(404).json({ message: "You cannot delete image" });
      }

      if (!album.userId.equals(userId)) {
        return res.status(404).json({ message: "You cannot delete image" });
      }

      const imageToDelete = await Image.findByIdAndDelete(imageId);
      if (!imageToDelete) {
        return res.status(404).json({ message: "Cannot delete images" });
      }

      const updateAlbum = await Album.findByIdAndUpdate(
        albumId,
        {
          $pull: { imageId: imageId },
        },
        { new: true }
      );

      if (!updateAlbum) {
        const newImage = new Image(image);
        await newImage.save();

        return res.status(200).json({ message: "Failed to delete image" });
      }

      return res
        .status(200)
        .json({ message: "Image got deleted", imageToDelete });
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Get All Users
app.get("/get/all/users", async (req, res) => {
  try {
    const allUsers = await Owner.find();

    if (!allUsers) {
      return res.status(404).json({ message: "Cannot find users" });
    }

    return res.status(200).json(allUsers);
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Get Album
app.get("/get/album", async (req, res) => {
  try {
    const allAlbums = await Album.find().populate({
      path: "imageId",
      select: "imageName",
    });

    if (!allAlbums) return res.status(404).json({ message: "No albums found" });

    return res.status(200).json(allAlbums);
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Post Album
app.post("/add/album", async (req, res) => {
  const albumData = req.body;

  try {
    const newAlbum = new Album(albumData);
    const savedAlbum = await newAlbum.save();

    if (!savedAlbum) {
      return res.status(404).json({ message: "Album cannot get save" });
    }

    return res.status(200).json({ message: "Album saved", savedAlbum });
  } catch (error) {
    return res
      .status(500)
      .json({ error: "Failed to fetch access token from Google." });
  }
});

// Update Album
app.post("/update/album/:albumId/user/:userId", async (req, res) => {
  const userId = req.params.userId;
  const albumId = req.params.albumId;
  const dataToUpdate = req.body;

  try {
    const correctAlbum = await Album.find({ userId });

    if (!correctAlbum)
      return res.status(404).json({ message: "You can't update album" });

    const updatedAlbum = await Album.findByIdAndUpdate(albumId, dataToUpdate, {
      new: true,
    });

    if (!updatedAlbum) {
      return res.status(404).json({ message: "Album cannot get update" });
    }

    return res.status(200).json(updatedAlbum);
  } catch (error) {
    return res
      .status(500)
      .json({ error: "Failed to fetch access token from Google." });
  }
});

// Share Album
app.post("/share/album/:albumId/user/:userId", async (req, res) => {
  const userId = req.params.userId;
  const albumId = req.params.albumId;
  const emailToAdd = req.body;

  try {
    const ownerAlbum = await Owner.findById(userId);

    if (!ownerAlbum) {
      return res.status(404).json({ message: "Album not found" });
    }

    const ownerEmail = emailToAdd.sharedUsers.some(
      (e) => e === ownerAlbum.email
    );

    if (ownerEmail) {
      return res
        .status(404)
        .json({ message: "Cannot send share to same owner" });
    }

    const albumToUpdate = await Album.findByIdAndUpdate(albumId, emailToAdd, {
      new: true,
    });

    if (!albumToUpdate) {
      return res.status(404).json({ message: "Album cannot get share" });
    }

    return res.status(200).json(albumToUpdate);
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Delete Album
app.delete("/delete/album/:albumId/user/:userId", async (req, res) => {
  const albumId = req.params.albumId;
  const userId = req.params.userId;

  try {
    const correctAlbum = await Album.find({ userId });

    if (correctAlbum.length < 1)
      return res.status(404).json({ message: "You can't delete album" });

    const deletedAlbum = await Album.findByIdAndDelete(albumId);

    if (!deletedAlbum) {
      return res.status(404).json({ message: "Album cannot get update" });
    }

    const imageToDelete = await Image.deleteMany({ albumId });

    if (!imageToDelete.acknowledged) {
      const newAlbum = new Album(correctAlbum);
      await newAlbum.save();
    }

    return res.status(200).json(deletedAlbum);
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server started at port", PORT);
});
