// server.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import axios from "axios";
import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier"; // to upload buffer

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" })); // accept JSON body up to 5MB

// Config Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Helper: call Gemini (Generative Language API) via REST
async function callGemini(prompt) {
  // NOTE: Using REST endpoint with API key parameter.
  // Replace model name if needed.
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateText?key=${apiKey}`;
  // The request shape can vary; this is a simple example. Adjust per Google docs.
  const body = {
    prompt: {
      text: `اكتب كتاب أطفال قصير بالعربية مكون من 5 فصول بعنوان: ${prompt || "مغامرة صغيرة"}. اجعل اللغة بسيطة ومناسبة للأطفال.`
    },
    // optional parameters:
    maxOutputTokens: 800
  };

  const resp = await axios.post(url, body, {
    headers: { "Content-Type": "application/json" },
    timeout: 20000
  });

  // Adjust path depending on API response shape.
  // Some endpoints return .data.candidates[0].content/response...
  // Here we try a few possibilities safely.
  const data = resp.data;
  // try common fields:
  if (data?.candidates?.[0]?.content?.[0]?.text) {
    return data.candidates[0].content[0].text;
  }
  if (data?.output?.[0]?.content) {
    return Array.isArray(data.output[0].content) ? data.output[0].content.map(c=>c.text || "").join("\n") : data.output[0].content.text;
  }
  // fallback — stringify entire response
  return JSON.stringify(data);
}

// Route: health
app.get("/", (req, res) => {
  res.send({ status: "ok", msg: "Children AI Books backend running" });
});

// Route: generate story (returns generated text)
app.post("/api/generate", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt || prompt.trim().length === 0) {
      return res.status(400).json({ error: "prompt required in body" });
    }
    const text = await callGemini(prompt);
    return res.json({ story: text });
  } catch (err) {
    console.error("generate error:", err?.response?.data || err.message || err);
    return res.status(500).json({ error: "Failed to generate story", detail: err?.message || null });
  }
});

// Route: upload file to Cloudinary
// Accepts JSON { file: "<data url or base64 string>", filename: "optional name" }
// For production you'd likely use multipart/form-data; here we accept base64 for simplicity.
app.post("/api/upload", async (req, res) => {
  try {
    const { file, filename } = req.body;
    if (!file) return res.status(400).json({ error: "file (base64 or dataURL) required" });

    // Remove data URL prefix if exists
    const matches = file.match(/^data:(.+);base64,(.+)$/);
    let buffer;
    if (matches) {
      buffer = Buffer.from(matches[2], "base64");
    } else {
      // assume plain base64
      buffer = Buffer.from(file, "base64");
    }

    // upload stream to Cloudinary
    const streamUpload = () => {
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: "children_books",
            public_id: filename ? filename.replace(/\.[^/.]+$/, "") : undefined,
            resource_type: "auto"
          },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          }
        );
        streamifier.createReadStream(buffer).pipe(uploadStream);
      });
    };

    const result = await streamUpload();
    return res.json({ url: result.secure_url, raw: result });
  } catch (err) {
    console.error("upload error:", err);
    return res.status(500).json({ error: "Upload failed", detail: err?.message || null });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));