import { ExpressAuth } from "@auth/express";
import express from "express";

const app = express();

// NOTE: Uncomment this line once we put this app behind Cloudflare or another reverse proxy.
//app.set("trust proxy", true);

app.use(ExpressAuth({
  baseUrl: process.env.AUTH_BASE_URL || "http://localhost:6247",
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  providers: [
    // Configure Authentik here?
  ],
}));