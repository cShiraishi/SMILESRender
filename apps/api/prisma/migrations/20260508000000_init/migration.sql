CREATE TABLE "usage_events" (
  "id"          SERIAL PRIMARY KEY,
  "ts"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "method"      VARCHAR(10)  NOT NULL,
  "path"        VARCHAR(255) NOT NULL,
  "status_code" INTEGER      NOT NULL,
  "duration_ms" INTEGER      NOT NULL,
  "ip"          VARCHAR(45)
);

CREATE INDEX "usage_events_ts_idx"   ON "usage_events" ("ts");
CREATE INDEX "usage_events_path_idx" ON "usage_events" ("path");

CREATE TABLE "users" (
  "id"            SERIAL PRIMARY KEY,
  "email"         VARCHAR(255) NOT NULL UNIQUE,
  "password_hash" VARCHAR(255) NOT NULL,
  "role"          VARCHAR(50)  NOT NULL DEFAULT 'user',
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
