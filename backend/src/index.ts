import dotenv from "dotenv";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { analyzeRoute } from "./routes/analyze.js";

dotenv.config({ override: true });

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true }));
app.route("/", analyzeRoute);

const port = Number(process.env.PORT ?? 8787);

serve(
  {
    fetch: app.fetch,
    port,
  },
  () => {
    console.log(`Snoop backend listening on http://localhost:${port}`);
  },
);
