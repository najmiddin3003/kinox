const mongoose = require("mongoose");
const videoSchema = new mongoose.Schema({ lang: String, label: String, url: String }, { _id: false });
const schema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  overview: { type: String, default: "" },
  poster: { type: String, required: true },
  backdrop: { type: String, default: "" },
  year: Number,
  genres: [String],
  duration: { type: String, default: "" },
  director: { type: String, default: "" },
  cast: { type: String, default: "" },
  country: { type: String, default: "" },
  videos: { type: [videoSchema], default: [] },
  videoUrl: { type: String, default: "" },
  featured: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
  source: { type: String, default: "catalog" }
}, { timestamps: true });
module.exports = mongoose.model("Movie", schema);
