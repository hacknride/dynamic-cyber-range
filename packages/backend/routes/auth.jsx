import { Auth } from "@auth/express";
import GitHub from "@auth/core/providers/github";
import express from "express";

const router = express.Router();

router.use("/auth", async (req, res) => {
  const response = await Auth(req, res, {
    providers: [
      GitHub({
        clientId: process.env.GITHUB_ID,
        clientSecret: process.env.GITHUB_SECRET,
      }),
    ],
    secret: process.env.AUTH_SECRET,
    callbacks: {
      async session({ session, token }) {
        return session;
      },
    },
  });

  return response;
});

export default router;
