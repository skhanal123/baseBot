-- Telecom agent demo schema (same DB as baseBot threads/messages)

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS telecom_demo_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS demo_user_customer_map (
  user_id VARCHAR(256) PRIMARY KEY,
  customer_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_demo_user_customer_map_customer
  ON demo_user_customer_map (customer_id);

CREATE TABLE IF NOT EXISTS telecom_plans (
  plan_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  data_limit_gb DOUBLE PRECISION NOT NULL,
  price_per_month DOUBLE PRECISION NOT NULL,
  data_refueling_price_per_gb DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS telecom_devices (
  device_id TEXT PRIMARY KEY,
  device_type TEXT NOT NULL,
  model TEXT NOT NULL,
  imei TEXT NOT NULL,
  is_esim_capable BOOLEAN NOT NULL,
  activated BOOLEAN NOT NULL,
  activation_date TIMESTAMPTZ,
  last_esim_transfer_date TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS telecom_lines (
  line_id TEXT PRIMARY KEY,
  phone_number TEXT NOT NULL,
  status TEXT NOT NULL,
  plan_id TEXT NOT NULL REFERENCES telecom_plans (plan_id),
  device_id TEXT NOT NULL REFERENCES telecom_devices (device_id),
  data_used_gb DOUBLE PRECISION NOT NULL,
  data_refueling_gb DOUBLE PRECISION NOT NULL,
  roaming_enabled BOOLEAN NOT NULL,
  contract_end_date DATE,
  last_plan_change_date DATE,
  last_sim_replacement_date DATE,
  suspension_start_date DATE
);

CREATE TABLE IF NOT EXISTS telecom_customers (
  customer_id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  date_of_birth DATE,
  email TEXT,
  phone_number TEXT,
  account_status TEXT NOT NULL,
  created_at TIMESTAMPTZ,
  last_extension_date DATE,
  goodwill_credit_used_this_year DOUBLE PRECISION NOT NULL DEFAULT 0,
  line_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  bill_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  payment_methods JSONB NOT NULL DEFAULT '[]'::jsonb,
  address JSONB
);

CREATE TABLE IF NOT EXISTS telecom_bills (
  bill_id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES telecom_customers (customer_id),
  period_start DATE,
  period_end DATE,
  issue_date DATE,
  total_due DOUBLE PRECISION NOT NULL,
  due_date DATE,
  status TEXT NOT NULL,
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_telecom_bills_customer
  ON telecom_bills (customer_id);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  section TEXT,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  UNIQUE (source, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_source
  ON knowledge_chunks (source);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
  ON knowledge_chunks
  USING hnsw (embedding vector_cosine_ops);
