// Legacy local-only Express server. Vercel uses /api/* serverless functions instead.
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

interface WaveSessionRecord {
  reference: string;
  amount: number;
  currency: string;
  productTitle: string;
  clientPhone?: string;
  status: "pending" | "completed" | "failed";
  merchantPhone: string;
  merchantName: string;
  waveSessionId?: string;
  waveLaunchUrl?: string;
  transactionId?: string;
  createdAt: string;
  completedAt?: string;
}

const waveSessions = new Map<string, WaveSessionRecord>();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health check endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ 
      status: "ok", 
      time: new Date().toISOString(),
      waveConfigured: Boolean(process.env.WAVE_API_KEY && process.env.WAVE_API_KEY.trim().length > 0)
    });
  });

  // Wave Business configuration endpoint
  app.get("/api/wave/config", (_req, res) => {
    const merchantPhone = process.env.WAVE_BUSINESS_MERCHANT_ID || "777794576";
    const hasApiKey = Boolean(process.env.WAVE_API_KEY && process.env.WAVE_API_KEY.trim().length > 0);

    res.json({
      merchantPhone,
      merchantFormatted: "+221 77 779 45 76",
      merchantName: "Marché Express",
      hasApiKey,
      status: "active",
      currency: "XOF"
    });
  });

  // Create a Wave Checkout session
  app.post("/api/wave/create-checkout-session", async (req, res) => {
    try {
      const { 
        amount, 
        currency = "FCFA", 
        reference, 
        productTitle = "Publication Annonce Marché Express", 
        clientPhone,
        successUrl,
        errorUrl 
      } = req.body;

      if (!amount || !reference) {
        return res.status(400).json({ error: "Montant et référence obligatoires" });
      }

      const merchantPhone = process.env.WAVE_BUSINESS_MERCHANT_ID || "777794576";
      const merchantName = "Marché Express";
      const apiKey = process.env.WAVE_API_KEY?.trim();

      // If user has configured an official Wave API key, call the official Wave Checkout API
      if (apiKey) {
        try {
          const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
          const finalSuccessUrl = successUrl || `${appUrl}/?wave_status=success&ref=${encodeURIComponent(reference)}`;
          const finalErrorUrl = errorUrl || `${appUrl}/?wave_status=cancelled&ref=${encodeURIComponent(reference)}`;

          const waveResponse = await fetch("https://api.wave.com/v1/checkout/sessions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              amount: String(Math.round(amount)),
              currency: "XOF",
              error_url: finalErrorUrl,
              success_url: finalSuccessUrl,
              client_reference: reference
            })
          });

          if (waveResponse.ok) {
            const data = await waveResponse.json();
            const record: WaveSessionRecord = {
              reference,
              amount: Math.round(amount),
              currency: "FCFA",
              productTitle,
              clientPhone,
              status: "pending",
              merchantPhone,
              merchantName,
              waveSessionId: data.id,
              waveLaunchUrl: data.wave_launch_url,
              createdAt: new Date().toISOString()
            };
            waveSessions.set(reference, record);

            return res.json({
              success: true,
              mode: "api",
              launch_url: data.wave_launch_url,
              session_id: data.id,
              reference,
              merchantPhone,
              merchantName,
              amount: Math.round(amount)
            });
          } else {
            const errText = await waveResponse.text();
            console.warn("[Wave API] Checkout session failed, falling back to direct merchant flow:", errText);
          }
        } catch (apiErr) {
          console.warn("[Wave API] Network error connecting to api.wave.com:", apiErr);
        }
      }

      const merchantId = process.env.WAVE_BUSINESS_MERCHANT_ID || "M_sn_BWPOyZIDzJsn";
      const directWaveUrl = `https://pay.wave.com/m/${merchantId}/c/sn/?amount=${Math.round(amount)}`;

      // Merchant direct flow (account associated with M_sn_BWPOyZIDzJsn / 77 779 45 76)
      const record: WaveSessionRecord = {
        reference,
        amount: Math.round(amount),
        currency: "FCFA",
        productTitle,
        clientPhone,
        status: "pending",
        merchantPhone,
        merchantName,
        waveLaunchUrl: directWaveUrl,
        createdAt: new Date().toISOString()
      };
      waveSessions.set(reference, record);

      return res.json({
        success: true,
        mode: "merchant_direct",
        launch_url: directWaveUrl,
        reference,
        amount: Math.round(amount),
        merchantPhone,
        merchantFormatted: "+221 77 779 45 76",
        merchantName,
        instructions: `Envoyez ${Math.round(amount)} FCFA via le lien officiel Wave Business ou au compte 77 779 45 76 avec la référence ${reference}`
      });
    } catch (err: any) {
      console.error("Error creating Wave checkout session:", err);
      return res.status(500).json({ error: "Erreur serveur lors de la création de la session de paiement Wave" });
    }
  });

  // Verify / validate a Wave payment
  app.post("/api/wave/verify-payment", async (req, res) => {
    try {
      const { reference, transactionId } = req.body;
      if (!reference) {
        return res.status(400).json({ error: "Référence de transaction requise" });
      }

      const session = waveSessions.get(reference);
      const apiKey = process.env.WAVE_API_KEY?.trim();

      // If Wave API key is present and we have a waveSessionId, check status from Wave API
      if (apiKey && session?.waveSessionId) {
        try {
          const waveCheck = await fetch(`https://api.wave.com/v1/checkout/sessions/${session.waveSessionId}`, {
            headers: {
              "Authorization": `Bearer ${apiKey}`
            }
          });
          if (waveCheck.ok) {
            const checkData = await waveCheck.json();
            if (checkData.checkout_status === "complete") {
              session.status = "completed";
              session.completedAt = new Date().toISOString();
              session.transactionId = checkData.transaction_id || transactionId || `TX-WAVE-${Date.now()}`;
              waveSessions.set(reference, session);

              return res.json({
                success: true,
                verified: true,
                status: "completed",
                reference,
                transactionId: session.transactionId,
                message: "Paiement Wave vérifié avec succès via l'API Wave Business !"
              });
            }
          }
        } catch (checkErr) {
          console.warn("Wave API verification check failed:", checkErr);
        }
      }

      return res.status(200).json({
        success: false,
        verified: false,
        status: "pending",
        reference,
        transactionId: transactionId?.trim(),
        message: "Le paiement n'a pas encore été confirmé par Wave. Aucune validation automatique n'a été effectuée."
      });
    } catch (err: any) {
      console.error("Error verifying Wave payment:", err);
      return res.status(500).json({ error: "Erreur lors de la vérification du paiement Wave" });
    }
  });

  // Wave Webhook endpoint (for asynchronous notifications from Wave Business)
  app.post("/api/wave/webhook", (req, res) => {
    try {
      const event = req.body;
      console.log("[Wave Webhook Event Received]:", event?.type);

      if (event?.type === "checkout.session.completed") {
        const sessionData = event.data;
        const clientRef = sessionData?.client_reference;
        if (clientRef && waveSessions.has(clientRef)) {
          const s = waveSessions.get(clientRef)!;
          s.status = "completed";
          s.completedAt = new Date().toISOString();
          s.transactionId = sessionData.transaction_id || `TX-WH-${Date.now()}`;
          waveSessions.set(clientRef, s);
          console.log(`[Wave Webhook] Session ${clientRef} automatically marked as COMPLETED`);
        }
      }

      return res.json({ received: true });
    } catch (err) {
      console.error("Webhook processing error:", err);
      return res.status(400).json({ error: "Webhook processing error" });
    }
  });

  // Check status of a session
  app.get("/api/wave/session/:reference", (req, res) => {
    const { reference } = req.params;
    const session = waveSessions.get(reference);
    if (!session) {
      return res.status(404).json({ error: "Session non trouvée", reference });
    }
    return res.json(session);
  });

  // Vite middleware for development vs Static serving for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Marché Express local server running on port ${PORT}`);
  });
}

startServer();
