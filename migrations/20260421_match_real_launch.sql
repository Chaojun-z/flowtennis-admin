CREATE TABLE IF NOT EXISTS match_users (
  id TEXT PRIMARY KEY,
  openid TEXT NOT NULL UNIQUE,
  unionid TEXT,
  nickName TEXT,
  avatarUrl TEXT,
  phone TEXT,
  ntrpLevel TEXT,
  createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS match_posts (
  id TEXT PRIMARY KEY,
  creatorUserId TEXT NOT NULL REFERENCES match_users(id),
  title TEXT NOT NULL,
  matchType TEXT NOT NULL CHECK (matchType IN ('single','double')),
  targetHeadcount INTEGER NOT NULL CHECK (targetHeadcount > 0),
  startTime TIMESTAMPTZ NOT NULL,
  endTime TIMESTAMPTZ NOT NULL,
  venueName TEXT,
  venueAddress TEXT,
  venueLatitude NUMERIC,
  venueLongitude NUMERIC,
  ntrpMin NUMERIC NOT NULL,
  ntrpMax NUMERIC NOT NULL,
  genderPreference TEXT NOT NULL,
  estimatedCourtFee NUMERIC NOT NULL CHECK (estimatedCourtFee > 0),
  finalCourtFee NUMERIC,
  status TEXT NOT NULL DEFAULT 'open',
  cancelReason TEXT,
  createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (endTime > startTime)
);

CREATE TABLE IF NOT EXISTS match_registrations (
  id TEXT PRIMARY KEY,
  matchId TEXT NOT NULL REFERENCES match_posts(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES match_users(id),
  registrationStatus TEXT NOT NULL DEFAULT 'registered',
  createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelledAt TIMESTAMPTZ,
  financialResponsibility TEXT,
  withdrawalReason TEXT,
  withdrawalHandledBy TEXT,
  withdrawalHandledAt TIMESTAMPTZ
);

ALTER TABLE match_registrations ADD COLUMN IF NOT EXISTS financialResponsibility TEXT;
ALTER TABLE match_registrations ADD COLUMN IF NOT EXISTS withdrawalReason TEXT;
ALTER TABLE match_registrations ADD COLUMN IF NOT EXISTS withdrawalHandledBy TEXT;
ALTER TABLE match_registrations ADD COLUMN IF NOT EXISTS withdrawalHandledAt TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS match_registrations_active_unique
  ON match_registrations(matchId,userId)
  WHERE registrationStatus='registered';

CREATE TABLE IF NOT EXISTS match_attendance (
  id TEXT PRIMARY KEY,
  matchId TEXT NOT NULL REFERENCES match_posts(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES match_users(id),
  selfStatus TEXT NOT NULL DEFAULT 'pending',
  creatorStatus TEXT NOT NULL DEFAULT 'pending',
  finalStatus TEXT NOT NULL DEFAULT 'pending',
  updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(matchId,userId)
);

CREATE TABLE IF NOT EXISTS match_bookings (
  id TEXT PRIMARY KEY,
  matchId TEXT NOT NULL REFERENCES match_posts(id) ON DELETE CASCADE,
  operatorUserId TEXT NOT NULL,
  venueNameFinal TEXT,
  venueAddressFinal TEXT,
  venueLatitudeFinal NUMERIC,
  venueLongitudeFinal NUMERIC,
  courtNo TEXT,
  bookingStartTime TIMESTAMPTZ,
  bookingEndTime TIMESTAMPTZ,
  finalCourtFee NUMERIC,
  bookingStatus TEXT NOT NULL,
  createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS match_fee_records (
  id TEXT PRIMARY KEY,
  matchId TEXT NOT NULL UNIQUE REFERENCES match_posts(id) ON DELETE CASCADE,
  estimatedCourtFee NUMERIC,
  finalCourtFee NUMERIC NOT NULL,
  participantCount INTEGER NOT NULL,
  aaAmount NUMERIC NOT NULL,
  roundingRule TEXT NOT NULL DEFAULT 'ceil',
  roundingDifference NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS match_fee_splits (
  id TEXT PRIMARY KEY,
  matchId TEXT NOT NULL REFERENCES match_posts(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES match_users(id),
  amount NUMERIC NOT NULL,
  payStatus TEXT NOT NULL DEFAULT 'pending',
  paidAmount NUMERIC NOT NULL DEFAULT 0,
  paidAt TIMESTAMPTZ,
  note TEXT,
  createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS match_fee_splits_user_unique
  ON match_fee_splits(matchId,userId)
  WHERE payStatus NOT IN ('cancelled','refunded');

CREATE TABLE IF NOT EXISTS match_operation_logs (
  id TEXT PRIMARY KEY,
  matchId TEXT REFERENCES match_posts(id) ON DELETE CASCADE,
  operatorType TEXT NOT NULL CHECK (operatorType IN ('match_user','admin_user')),
  operatorId TEXT NOT NULL,
  action TEXT NOT NULL,
  before JSONB,
  after JSONB,
  createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_posts_status ON match_posts(status);
CREATE INDEX IF NOT EXISTS idx_match_posts_startTime ON match_posts(startTime);
CREATE INDEX IF NOT EXISTS idx_match_registrations_matchId ON match_registrations(matchId);
CREATE INDEX IF NOT EXISTS idx_match_registrations_userId ON match_registrations(userId);
CREATE INDEX IF NOT EXISTS idx_match_attendance_matchId ON match_attendance(matchId);
CREATE INDEX IF NOT EXISTS idx_match_bookings_matchId ON match_bookings(matchId);
CREATE INDEX IF NOT EXISTS idx_match_fee_records_status ON match_fee_records(status);
CREATE INDEX IF NOT EXISTS idx_match_fee_splits_matchId ON match_fee_splits(matchId);
CREATE INDEX IF NOT EXISTS idx_match_fee_splits_userId ON match_fee_splits(userId);
CREATE INDEX IF NOT EXISTS idx_match_fee_splits_payStatus ON match_fee_splits(payStatus);
CREATE INDEX IF NOT EXISTS idx_match_logs_matchId ON match_operation_logs(matchId);
