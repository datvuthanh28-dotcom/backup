import { db, getPool } from "../config/db.js";
import sql from "mssql";
import { verifyDeliveryAddress, getAddressSuggestionsFromGeoapify } from "../services/addressVerificationService.js";
import { sendNewsletterWelcomeEmail } from "../services/emailService.js";

const NEWSLETTER_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function subscribeNewsletter(req, res) {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email || !NEWSLETTER_EMAIL_REGEX.test(email)) {
      return res.status(400).json({ success: false, error: "Please enter a valid email address." });
    }

    const { subscriber, created } = await db.subscribeNewsletter(email, req.body?.source || "footer");
    if (created) {
      await sendNewsletterWelcomeEmail({ email: subscriber.email }).catch((err) => {
        console.warn("[Newsletter] Welcome email failed:", err?.message || err);
      });
    }

    return res.status(created ? 201 : 200).json({
      success: true,
      alreadySubscribed: !created,
      subscriber: { email: subscriber.email, subscribed_at: subscriber.subscribed_at },
      message: created
        ? "Thank you for subscribing. A confirmation email has been sent."
        : "You are already subscribed to The Maison Rue Newsletter.",
    });
  } catch (err) {
    console.error("[Newsletter] Subscribe Error:", err);
    return res.status(500).json({ success: false, error: "Unable to subscribe right now. Please try again." });
  }
}

export async function getAccount(req, res) {
  const pool = getPool();
  const addresses = await pool.request().input("user_id", sql.NVarChar, req.user.id).query("SELECT id,address_text,is_default FROM CustomerAddresses WHERE user_id=@user_id AND is_active=1 ORDER BY is_default DESC,id DESC");
  const preferences = await pool.request().input("user_id", sql.NVarChar, req.user.id).query("SELECT marketing_email FROM CustomerPreferences WHERE user_id=@user_id");
  return res.json({ success: true, addresses: addresses.recordset, preferences: preferences.recordset[0] || { marketing_email: false } });
}

export async function getAddressSuggestions(req, res) {
  const query = String(req.query.input || "").trim();
  if (query.length < 3) return res.json({ success: true, suggestions: [] });
  try {
    const suggestions = await getAddressSuggestionsFromGeoapify(query, req.query.country || "VN");
    return res.json({ success: true, suggestions });
  } catch (err) {
    console.error("[Customer Address Suggestions]", err.message);
    return res.status(err.status || 502).json({ success: false, error: err.message || "Geoapify suggestions are temporarily unavailable." });
  }
}

export async function verifyAddress(req, res) {
  const text = String(req.body.address || "").trim();
  if (!text) {
    return res.status(400).json({ success: false, error: "Vui lòng nhập địa chỉ cần kiểm tra." });
  }
  try {
    const verified = await verifyDeliveryAddress(text, { country: req.body.country || "VN" });
    return res.json({ success: true, verifiedAddress: verified });
  } catch (err) {
    return res.status(err.status || 422).json({
      success: false,
      error: err.message || "Chưa đủ thông tin để xác minh địa chỉ giao hàng.",
      code: err.code || "ADDRESS_VERIFICATION_FAILED",
    });
  }
}

export async function addAddress(req, res) {
  const text = String(req.body.address || "").trim();
  if (!text) return res.status(400).json({ success: false, error: "Please enter a delivery address." });
  let verified;
  try {
    verified = await verifyDeliveryAddress(text, { country: req.body.country || "VN" });
  } catch (error) {
    return res.status(error.status || 422).json({ success: false, error: error.message });
  }
  const pool = getPool(); const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const current = await new sql.Request(transaction).input("user_id", sql.NVarChar, req.user.id)
      .query("SELECT id FROM CustomerAddresses WITH (UPDLOCK,HOLDLOCK) WHERE user_id=@user_id AND is_active=1");
    if (current.recordset.length >= 3) throw Object.assign(new Error("You can save up to three delivery addresses."), { status: 400 });
    const shouldDefault = current.recordset.length === 0 || Boolean(req.body.isDefault);
    if (shouldDefault) await new sql.Request(transaction).input("user_id", sql.NVarChar, req.user.id)
      .query("UPDATE CustomerAddresses SET is_default=0 WHERE user_id=@user_id AND is_active=1");
    await new sql.Request(transaction).input("user_id", sql.NVarChar, req.user.id).input("address", sql.NVarChar, verified.formatted)
      .input("is_default", sql.Bit, shouldDefault ? 1 : 0)
      .query("INSERT INTO CustomerAddresses(user_id,address_text,is_default) VALUES(@user_id,@address,@is_default)");
    await transaction.commit(); return getAccount(req, res);
  } catch (error) { if (transaction._aborted !== undefined) await transaction.rollback().catch(() => {}); return res.status(error.status || 500).json({ success: false, error: error.message || "Unable to save this address." }); }
}
export async function updateAddress(req, res) {
  const id = Number(req.params.id); const text = String(req.body.address || "").trim();
  if (!id || !text) return res.status(400).json({ success: false, error: "Please enter a valid delivery address." });
  let verified;
  try {
    verified = await verifyDeliveryAddress(text, { country: req.body.country || "VN" });
  } catch (error) {
    return res.status(error.status || 422).json({ success: false, error: error.message });
  }
  const pool = getPool(); const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const found = await new sql.Request(transaction).input("id", sql.Int, id).input("user_id", sql.NVarChar, req.user.id)
      .query("SELECT id,is_default FROM CustomerAddresses WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND user_id=@user_id AND is_active=1");
    if (!found.recordset.length) throw Object.assign(new Error("Address not found."), { status: 404 });
    const keepDefault = Boolean(found.recordset[0].is_default) || Boolean(req.body.isDefault);
    if (keepDefault) await new sql.Request(transaction).input("user_id", sql.NVarChar, req.user.id)
      .query("UPDATE CustomerAddresses SET is_default=0 WHERE user_id=@user_id AND is_active=1");
    await new sql.Request(transaction).input("id", sql.Int, id).input("user_id", sql.NVarChar, req.user.id).input("address", sql.NVarChar, verified.formatted).input("is_default", sql.Bit, keepDefault ? 1 : 0)
      .query("UPDATE CustomerAddresses SET address_text=@address,is_default=@is_default,updated_at=GETDATE() WHERE id=@id AND user_id=@user_id AND is_active=1");
    await transaction.commit(); return getAccount(req, res);
  } catch (error) { if (transaction._aborted !== undefined) await transaction.rollback().catch(() => {}); return res.status(error.status || 500).json({ success: false, error: error.message || "Unable to update this address." }); }
}
export async function deleteAddress(req, res) {
  const id = Number(req.params.id); if (!id) return res.status(400).json({ success: false, error: "Invalid address." });
  const pool = getPool(); const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const found = await new sql.Request(transaction).input("id", sql.Int, id).input("user_id", sql.NVarChar, req.user.id)
      .query("SELECT id,is_default FROM CustomerAddresses WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND user_id=@user_id AND is_active=1");
    if (!found.recordset.length) throw Object.assign(new Error("Address not found."), { status: 404 });
    await new sql.Request(transaction).input("id", sql.Int, id).input("user_id", sql.NVarChar, req.user.id)
      .query("UPDATE CustomerAddresses SET is_active=0,is_default=0,updated_at=GETDATE() WHERE id=@id AND user_id=@user_id");
    if (found.recordset[0].is_default) await new sql.Request(transaction).input("user_id", sql.NVarChar, req.user.id)
      .query(";WITH next_address AS (SELECT TOP 1 id FROM CustomerAddresses WHERE user_id=@user_id AND is_active=1 ORDER BY id DESC) UPDATE CustomerAddresses SET is_default=1 WHERE id IN (SELECT id FROM next_address)");
    await transaction.commit(); return getAccount(req, res);
  } catch (error) { if (transaction._aborted !== undefined) await transaction.rollback().catch(() => {}); return res.status(error.status || 500).json({ success: false, error: error.message || "Unable to remove this address." }); }
}
export async function updatePreferences(req, res) { const pool=getPool(); await pool.request().input("user_id",sql.NVarChar,req.user.id).input("marketing",sql.Bit,req.body.marketingEmail ? 1 : 0).query("MERGE CustomerPreferences AS t USING (SELECT @user_id user_id) s ON t.user_id=s.user_id WHEN MATCHED THEN UPDATE SET marketing_email=@marketing,updated_at=GETDATE() WHEN NOT MATCHED THEN INSERT(user_id,marketing_email) VALUES(@user_id,@marketing);"); return getAccount(req,res); }
export async function updateProfile(req, res) { const name=String(req.body.name||"").trim(); const phone=String(req.body.phone||"").trim(); const email=String(req.body.email||"").trim().toLowerCase(); if(!name) return res.status(400).json({success:false,error:"Họ tên không được để trống."}); if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({success:false,error:"Email không hợp lệ."}); const pool=getPool(); const duplicate=await pool.request().input("email",sql.NVarChar,email).input("id",sql.NVarChar,req.user.id).query("SELECT TOP 1 id FROM Users WHERE LOWER(email)=@email AND id<>@id"); if(duplicate.recordset.length) return res.status(409).json({success:false,error:"Email đã được sử dụng."}); await pool.request().input("id",sql.NVarChar,req.user.id).input("name",sql.NVarChar,name).input("phone",sql.NVarChar,phone).input("email",sql.NVarChar,email).query("UPDATE Users SET name=@name,phone=@phone,email=@email WHERE id=@id"); return res.json({success:true,user:{...req.user,name,phone,email}}); }
