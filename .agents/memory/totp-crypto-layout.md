---
name: TOTP secret encryption format
description: AES-256-GCM layout used to store encrypted TOTP secrets in the DB
---

## Format
`iv_hex.authTag_hex.ciphertext_hex`

All three components are hex-encoded and dot-separated.

## Key derivation
```typescript
scryptSync(SESSION_SECRET, "totp-secret-key-v1", 32)
```
Salt is the literal string `"totp-secret-key-v1"`.

## Decrypt (for test scripts)
```typescript
import { createDecipheriv, scryptSync } from "node:crypto";
const key = scryptSync(process.env.SESSION_SECRET!, "totp-secret-key-v1", 32) as Buffer;
const [ivHex, authTagHex, ciphertextHex] = stored.split(".");
const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]).toString("utf8");
```

**Why:** SESSION_SECRET is the only long-lived secret available at runtime; key rotation requires re-encrypting all TOTP secrets.
