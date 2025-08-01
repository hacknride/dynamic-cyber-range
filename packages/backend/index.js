import express from "express";
import { ExpressAuth } from "@auth/express";
import dotenv from "dotenv";

dotenv.config();    // Load environment variables from .env file

// The Authentik Provider configuration
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
    return {
      id: profile.sub,
      name: profile.name,
      email: profile.email,
    };
  },
};

const app = express();

// NOTE: Uncomment this line once we put this app behind Cloudflare or another reverse proxy.
//app.set("trust proxy", true);

app.use(
  ExpressAuth({
    secret: process.env.AUTH_SECRET,
    baseUrl: process.env.AUTH_BASE_URL || "http://localhost:6247",
    trustHost: true,
    providers: [
      authentikProvider
    ],
    callbacks: {
      async jwt({ token, account, user}) {
        if (account) {
          token.accessToken = account.access_token;
        }
        return token;
      },
    },
  })
);

app.get("/api/status", (req, res) => {
  
  if(req.auth?.user) {
    return res.json({message: "You are authenticated!", user: req.auth.user});
  }

  res.status(401).json({ message: "You are not authenticated (womp womp)."});
});

app.listen(6247, () => {
  console.log("Server is running on localhost:6247, hooray!");
});