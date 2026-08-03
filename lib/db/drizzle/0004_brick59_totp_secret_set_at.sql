-- Brick 5.9: track when the TOTP secret was last written so the enroll
-- endpoint can detect a fresh unconfirmed secret and return it instead of
-- regenerating (which would silently invalidate the QR code the user scanned).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totp_secret_set_at" timestamp with time zone;
