CREATE TABLE IF NOT EXISTS match_player_ratings (
  id TEXT PRIMARY KEY,
  matchId TEXT NOT NULL REFERENCES match_posts(id) ON DELETE CASCADE,
  raterUserId TEXT NOT NULL REFERENCES match_users(id),
  ratedUserId TEXT NOT NULL REFERENCES match_users(id),
  technicalLevel TEXT NOT NULL,
  createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (raterUserId <> ratedUserId)
);

CREATE UNIQUE INDEX IF NOT EXISTS match_player_ratings_unique
  ON match_player_ratings(matchId,raterUserId,ratedUserId);

CREATE INDEX IF NOT EXISTS idx_match_player_ratings_ratedUserId
  ON match_player_ratings(ratedUserId);
