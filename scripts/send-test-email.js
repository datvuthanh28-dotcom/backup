import "dotenv/config";
import {
  sendTestEmail,
  getResendConfig,
  getSmtpConfig,
  getActiveEmailProvider,
} from "../server/services/emailService.js";

/* global process */

const targetEmail = (process.argv[2] || process.env.TEST_EMAIL_TO || "").trim();

if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
  console.error("Thieu hoac sai dinh dang email nguoi nhan.");
  console.error("Cach dung: npm run email:test -- your-email@example.com");
  process.exit(1);
}

const provider = getActiveEmailProvider();
const { apiKey, from: resendFrom } = getResendConfig();
const { user: smtpUser, pass: smtpPass, from: smtpFrom } = getSmtpConfig();
const activeFrom = provider === "smtp" ? smtpFrom : resendFrom;

if (provider === "smtp" && (!smtpUser || !smtpPass || !smtpFrom)) {
  console.error("Thieu cau hinh SMTP_USER, SMTP_PASS hoac SMTP_FROM trong file .env");
  process.exit(1);
}
if (provider !== "smtp" && (!apiKey || !resendFrom)) {
  console.error("Thieu cau hinh RESEND_API_KEY hoac RESEND_FROM_EMAIL trong file .env");
  process.exit(1);
}

console.log(`Dang gui email kiem thu qua ${provider === "smtp" ? "Gmail SMTP" : "Resend"}...`);
console.log(`- From: ${activeFrom}`);
console.log(`- To:   ${targetEmail}`);

const result = await sendTestEmail({
  to: targetEmail,
  initiatedBy: "CLI (npm run email:test)",
});

if (!result.success) {
  console.error(`Gui that bai: ${result.error}`);
  process.exit(1);
}

if (provider === "smtp") {
  console.log(`Gmail SMTP da gui email thanh cong.`);
  console.log(`- SMTP Message ID: ${result.messageId}`);
  console.log(`Hay kiem tra hop thu den/Spam cua ${targetEmail}.`);
} else {
  console.log(`Resend da tiep nhan yeu cau gui email.`);
  console.log(`- Resend Email ID: ${result.messageId}`);
  console.log(
    `Luu y: Email ID cho thay API Resend da tiep nhan hop le. Hay kiem tra hop thu den/Spam va dashboard https://resend.com/emails de xac nhan trang thai delivered.`
  );
}

