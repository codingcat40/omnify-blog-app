require("dotenv").config(); // Load env variables

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const User = require("./models/User");
const Post = require("./models/Post");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const fs = require("fs");

const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");

// Environment variables
const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const SALT = bcrypt.genSaltSync(10);

//cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "mern-blog",
    allowed_formats: ["jpg", "png", "jpeg"],
  },
});

const app = express();
const uploadMiddleware = multer({ storage });

// Middleware
const allowedOrigins = [
  "http://localhost:3000",
  "https://omnify-blog.netlify.app", // replace with actual frontend domain once deployed
];

app.use(
  cors({
    credentials: true,
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  })
);

app.use(express.json());
app.use(cookieParser());

// Debug check
if (!MONGO_URI) {
  console.error("❌ MONGODB_URI not found in .env file");
  process.exit(1);
}

// MongoDB connection
mongoose
  .connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err);
    process.exit(1);
  });

// -------------------- HELPER -------------------- //
function requireAuth(req, res, next) {
  const { token } = req.cookies;
  if (!token) return res.status(401).json("Unauthorized");
  jwt.verify(token, JWT_SECRET, {}, (err, info) => {
    if (err) return res.status(401).json("Invalid token");
    req.user = info;
    next();
  });
}

// -------------------- ROUTES -------------------- //

app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  try {
    const userDoc = await User.create({
      username,
      password: bcrypt.hashSync(password, SALT),
    });
    res.json(userDoc);
  } catch (e) {
    res.status(400).json(e);
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const userDoc = await User.findOne({ username });
  if (!userDoc) return res.status(400).json("User not found");

  const passOk = bcrypt.compareSync(password, userDoc.password);
  if (passOk) {
    jwt.sign({ username, id: userDoc._id }, JWT_SECRET, {}, (err, token) => {
      if (err) throw err;
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production", // true on Render
          sameSite: "none", // allows cross-site cookies
        })
        .json({
          id: userDoc._id,
          username,
        });
    });
  } else {
    res.status(400).json("Wrong credentials");
  }
});

app.get("/profile", requireAuth, (req, res) => {
  res.json(req.user);
});

app.post("/logout", (req, res) => {
  res.cookie("token", "").json("ok");
});

// -------------------- POSTS -------------------- //

// Create Post (protected)
app.post(
  "/post",
  requireAuth,
  uploadMiddleware.single("file"),
  async (req, res) => {
    try {
      const { title, summary, content } = req.body;

      // Cloudinary will already give you a URL for the file
      const coverUrl = req.file ? req.file.path : null;

      const postDoc = await Post.create({
        title,
        summary,
        content,
        cover: coverUrl,
        author: req.user.id,
      });

      res.json(postDoc);
    } catch (err) {
      console.error("❌ Error creating post:", err);
      res.status(500).json({ error: "Failed to create post" });
    }
  }
);


// Update Post (protected)
app.put(
  "/post",
  requireAuth,
  uploadMiddleware.single("file"),
  async (req, res) => {
    let newPath = null;
    if (req.file) {
      const { originalname, path } = req.file;
      const ext = originalname.split(".").pop();
      newPath = path + "." + ext;
      fs.renameSync(path, newPath);
    }

    const { id, title, summary, content } = req.body;
    const postDoc = await Post.findById(id);

    if (!postDoc) return res.status(404).json("Post not found");
    if (String(postDoc.author) !== String(req.user.id)) {
      return res.status(403).json("You are not the author");
    }

    await postDoc.updateOne({
      title,
      summary,
      content,
      cover: newPath ? newPath : postDoc.cover,
    });

    res.json(postDoc);
  }
);

// Get Posts (public with pagination)
app.get("/post", async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const posts = await Post.find()
      .populate("author", ["username"])
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Post.countDocuments();

    res.json({
      posts,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch posts" });
  }
});

// Get Single Post (public)
app.get("/post/:id", async (req, res) => {
  const { id } = req.params;
  const postDoc = await Post.findById(id).populate("author", ["username"]);
  res.json(postDoc);
});

// Delete Post (protected)
app.delete("/post/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const postDoc = await Post.findById(id);

  if (!postDoc) return res.status(404).json("Post not found");
  if (String(postDoc.author) !== String(req.user.id)) {
    return res.status(403).json("You are not the author");
  }

  await Post.findByIdAndDelete(id);
  res.json({ success: true });
});

// -------------------- SERVER -------------------- //
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
