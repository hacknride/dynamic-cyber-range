import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import rangesRouter from "./src/routes/ranges.js";

dotenv.config();

const app = express();

app.use(express.json());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true,
  })
);

// Simple root + favicon (avoid any auth middleware here)
app.get("/", (_req, res) => res.send("Welcome to the Dynamic Cyber Range API!"));
app.get("/favicon.ico", (_req, res) => res.status(204).end());

// ONLY mount your ranges API
app.use("/api/ranges", rangesRouter);

app.listen(6247, () => {
  console.log("Server is running on http://localhost:6247");
});

import { ExpressAuth } from "@auth/express";

// Authentik provider config
const authentikProvider = {
  id: "authentik",
  name: "Authentik",
  type: "oauth",
  wellKnown: `${process.env.AUTHENTIK_ISSUER}/.well-known/openid-configuration`,
  clientId: process.env.AUTHENTIK_CLIENT_ID,
  clientSecret: process.env.AUTHENTIK_CLIENT_SECRET,
  authorization: { params: { scope: "openid email profile" } },
  idToken: true,
  checks: ["pkce", "state"],
  profile(profile) {
    return { id: profile.sub, name: profile.name, email: profile.email };
  },
};

// IMPORTANT: base path only — NO wildcard, NO regex
app.use(
  "/api/auth",
  ExpressAuth({
    secret: process.env.AUTH_SECRET,
    baseUrl: process.env.AUTH_BASE_URL || "http://localhost:6247",
    trustHost: true,
    providers: [authentikProvider],
    callbacks: {
      async jwt({ token, account }) {
        if (account) token.accessToken = account.access_token;
        return token;
      },
    },
  })
);

// Optional status
app.get("/api/status", (_req, res) => res.json({ ok: true }));
