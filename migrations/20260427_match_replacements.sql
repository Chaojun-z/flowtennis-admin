CREATE TABLE IF NOT EXISTS match_replacements (
  id TEXT PRIMARY KEY,
  matchId TEXT NOT NULL REFERENCES match_posts(id) ON DELETE CASCADE,
  fromUserId TEXT NOT NULL REFERENCES match_users(id),
  toUserId TEXT NOT NULL REFERENCES match_users(id),
  operatorUserId TEXT NOT NULL,
  originalSplitAmount NUMERIC NOT NULL DEFAULT 0,
  originalSplitRefundedAmount NUMERIC NOT NULL DEFAULT 0,
  replacementSplitAmount NUMERIC NOT NULL DEFAULT 0,
  replacementPayStatus TEXT NOT NULL DEFAULT 'pending',
  reason TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_replacements_matchId ON match_replacements(matchId);
CREATE INDEX IF NOT EXISTS idx_match_replacements_fromUserId ON match_replacements(fromUserId);
CREATE INDEX IF NOT EXISTS idx_match_replacements_toUserId ON match_replacements(toUserId);
