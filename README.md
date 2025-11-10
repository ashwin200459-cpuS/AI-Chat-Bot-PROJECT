AI Chatbot Complete — Frontend + Backend (SSE streaming)

Quick start:
1. cd server
2. npm install
3. rename .env.example -> .env and add your OPENAI_API_KEY
4. npm start
5. Open http://localhost:3000/realtime-chatbot.html in your browser (server serves the public folder)

Notes:
- The streaming endpoint uses Server-Sent Events to send tokens as they arrive from OpenAI.
- The frontend connects to /api/chat/stream with EventSource for a live typing effect.
- Do NOT commit your .env or API keys to public repositories.
