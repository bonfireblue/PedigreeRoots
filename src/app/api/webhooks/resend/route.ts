import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// Your personal email to forward all incoming emails to
const FORWARD_TO_EMAIL = "bonfireblue@gmail.com";

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    
    // Resend webhook event types: email.sent, email.delivered, email.bounced, email.complained, email.opened, email.clicked
    // For inbound emails (if using Resend Inbound), the event is different
    const eventType = payload.type;
    
    console.log("[Resend Webhook] Received event:", eventType);
    console.log("[Resend Webhook] Payload:", JSON.stringify(payload, null, 2));

    // Handle inbound email events
    if (eventType === "email.received" || payload.data?.from) {
      const emailData = payload.data;
      
      // Forward the email content to your personal email
      const { error } = await resend.emails.send({
        from: "Pedigree Roots Forwarded <support@pedigreeroots.com>",
        to: [FORWARD_TO_EMAIL],
        subject: `[Forwarded] ${emailData.subject || "No Subject"}`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; background: #f5f5f5; border-radius: 8px; margin-bottom: 20px;">
            <p><strong>From:</strong> ${emailData.from || "Unknown"}</p>
            <p><strong>To:</strong> ${emailData.to || "Unknown"}</p>
            <p><strong>Subject:</strong> ${emailData.subject || "No Subject"}</p>
            <p><strong>Received at:</strong> ${new Date().toISOString()}</p>
          </div>
          <div style="padding: 20px;">
            ${emailData.html || emailData.text || "<p>No content</p>"}
          </div>
        `,
      });

      if (error) {
        console.error("[Resend Webhook] Failed to forward email:", error);
        return NextResponse.json({ error: "FORWARD_FAILED" }, { status: 500 });
      }

      console.log("[Resend Webhook] Email forwarded successfully to", FORWARD_TO_EMAIL);
    }

    // Handle delivery status events (for tracking sent emails)
    if (["email.sent", "email.delivered", "email.bounced", "email.complained", "email.opened", "email.clicked"].includes(eventType)) {
      const emailData = payload.data;
      
      // Log the event - you can add database logging here if needed
      console.log(`[Resend Webhook] Email ${eventType}:`, {
        emailId: emailData.email_id,
        to: emailData.to,
        subject: emailData.subject,
      });

      // Optionally forward bounce/complaint notifications
      if (eventType === "email.bounced" || eventType === "email.complained") {
        await resend.emails.send({
          from: "Pedigree Roots Alerts <support@pedigreeroots.com>",
          to: [FORWARD_TO_EMAIL],
          subject: `[Alert] Email ${eventType === "email.bounced" ? "Bounced" : "Complained"}`,
          html: `
            <div style="font-family: sans-serif; padding: 20px;">
              <h2 style="color: ${eventType === "email.bounced" ? "#dc2626" : "#f59e0b"};">
                Email ${eventType === "email.bounced" ? "Bounced" : "Marked as Spam"}
              </h2>
              <p><strong>To:</strong> ${emailData.to}</p>
              <p><strong>Subject:</strong> ${emailData.subject || "Unknown"}</p>
              <p><strong>Email ID:</strong> ${emailData.email_id}</p>
              <p><strong>Time:</strong> ${new Date().toISOString()}</p>
            </div>
          `,
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Resend Webhook] Error processing webhook:", error);
    return NextResponse.json({ error: "WEBHOOK_ERROR" }, { status: 500 });
  }
}

// Resend may send a GET request to verify the endpoint
export async function GET() {
  return NextResponse.json({ status: "ok", message: "Resend webhook endpoint active" });
}
