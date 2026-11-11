import "dotenv/config";
import { sendTestEmail, getResendConfig } from "../server/services/emailService.js";

const targetEmail = (process.argv[2] || process.env.TEST_EMAIL_TO || "").trim();

if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
  console.error("Thieu hoac sai dinh dang email nguoi nhan.");
  console.error("Cach dung: npm run email:test -- your-email@example.com");
  process.exit(1);
}

const { apiKey, from } = getResendConfig();
if (!apiKey || !from) {
  console.error("Thieu cau hinh RESEND_API_KEY hoac RESEND_FROM_EMAIL trong file .env");
  process.exit(1);
}

console.log(`Dang gui email kiem thu qua Resend...`);
console.log(`- From: ${from}`);
console.log(`- To:   ${targetEmail}`);

const result = await sendTestEmail({
  to: targetEmail,
  initiatedBy: "CLI (npm run email:test)",
});

if (!result.success) {
  console.error(`Gui that bai: ${result.error}`);
  process.exit(1);
}

console.log(`Resend da tiep nhan yeu cau gui email.`);
console.log(`- Resend Email ID: ${result.messageId}`);
console.log(
  `Luu y: Email ID cho thay API Resend da tiep nhan hop le. Hay kiem tra hop thu den/Spam va dashboard https://resend.com/emails de xac nhan trang thai delivered.`
);

