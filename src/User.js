const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, lowercase: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["user", "admin"], default: "user" },
  blocked: { type: Boolean, default: false }
}, { timestamps: true });
module.exports = mongoose.model("User", schema);
