import { Hono } from "hono";
import { z } from "zod";
import { rateLimit } from "../middleware/ratelimit.js";
import { analyzePackage } from "../services/analyzer.js";
import type { AnalyzeRequest, Ecosystem } from "../types.js";

const bodySchema = z.object({
  package: z.string().trim().min(1, "package is required"),
  ecosystem: z.enum(["npm", "pip"]).optional(),
  version: z.string().trim().optional(),
});

export const analyzeRoute = new Hono();

analyzeRoute.use("/analyze", rateLimit());

analyzeRoute.post("/analyze", async (c) => {
  try {
    const body = await c.req.json<AnalyzeRequest>();
    const parsed = bodySchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        {
          error: "Invalid request payload",
          details: parsed.error.flatten(),
        },
        400,
      );
    }

    const ecosystem = (parsed.data.ecosystem ?? "npm") as Ecosystem;
    const result = await analyzePackage(parsed.data.package, ecosystem, parsed.data.version);
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});
