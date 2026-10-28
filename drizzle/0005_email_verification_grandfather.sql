-- Email verification was not required when these accounts were created.
-- Grandfather existing rows as verified so current users keep access.
-- New sign-ups still start with email_verified = false via Better Auth.
UPDATE "user" SET email_verified = true WHERE email_verified = false;
