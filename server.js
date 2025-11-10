import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

app.post("/api/chat", async (req, res) => {
  const { prompt } = req.body;
  try {
    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 600
      }),
    });
    const data = await aiRes.json();
    res.json({ reply: data.choices[0].message.content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ reply: "Error: " + err.message });
  }
});

// Server-Sent Events streaming endpoint.
// Use GET with `prompt` query param. The frontend will connect with EventSource.
app.get("/api/chat/stream", async (req, res) => {
  const prompt = req.query.prompt || "";
  if (!process.env.OPENAI_API_KEY) {
    res.status(500).send("Server missing OPENAI_API_KEY in .env");
    return;
  }

  // Headers for SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        stream: true
      }),
    });

    if (!upstream.ok) {
      const txt = await upstream.text();
      res.write(`event: error\ndata: ${JSON.stringify(txt)}\n\n`);
      res.write("event: done\ndata: [DONE]\n\n");
      res.end();
      return;
    }

    // Forward streamed chunks from OpenAI to the client as SSE messages.
    // The OpenAI stream sends `data: ...` lines. We'll read raw chunks and forward data lines.
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let done = false;
    let buffer = "";

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        // Split by newline pairs which indicate end of a data message block
        let parts = buffer.split(/\n\n/);
        buffer = parts.pop(); // remainder
        for (const part of parts) {
          const lines = part.split(/\n/).map(l => l.replace(/^data: ?/, ''));
          for (const line of lines) {
            if (line.trim() === "[DONE]") {
              // signal completion
              res.write("event: done\ndata: [DONE]\n\n");
              res.end();
              reader.releaseLock?.();
              return;
            }
            if (line.trim()) {
              // send as SSE 'message' (default event)
              // Escape newlines in the data payload
              const payload = line;
              res.write(`data: ${payload}\n\n`);
            }
          }
        }
      }
      done = readerDone;
    }
    // in case stream ends without explicit [DONE]
    res.write("event: done\ndata: [DONE]\n\n");
    res.end();
  } catch (err) {
    console.error("Stream error:", err);
    res.write(`event: error\ndata: ${JSON.stringify(err.message)}\n\n`);
    res.write("event: done\ndata: [DONE]\n\n");
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
