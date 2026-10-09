-- Up Migration

-- Every row the application writes already carries these values, and db/types.ts types them
-- as non-null; this makes the schema say so too. Columns typed `| null` (wars.creator_id,
-- moderation_log.target_war_id / target_voter_id) are unchanged.

ALTER TABLE voters ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE wars ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE contestants ALTER COLUMN war_id SET NOT NULL;
ALTER TABLE contestants ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE refresh_tokens ALTER COLUMN voter_id SET NOT NULL;
ALTER TABLE refresh_tokens ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE contestant_media ALTER COLUMN contestant_id SET NOT NULL;
ALTER TABLE contestant_media ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE matchups ALTER COLUMN war_id SET NOT NULL;
ALTER TABLE matchups ALTER COLUMN contestant_a_id SET NOT NULL;
ALTER TABLE matchups ALTER COLUMN contestant_b_id SET NOT NULL;
ALTER TABLE matchups ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE war_memberships ALTER COLUMN joined_at SET NOT NULL;
ALTER TABLE votes ALTER COLUMN matchup_id SET NOT NULL;
ALTER TABLE votes ALTER COLUMN voter_id SET NOT NULL;
ALTER TABLE votes ALTER COLUMN winner_id SET NOT NULL;
ALTER TABLE votes ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE reports ALTER COLUMN war_id SET NOT NULL;
ALTER TABLE reports ALTER COLUMN reporter_id SET NOT NULL;
ALTER TABLE reports ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE moderation_log ALTER COLUMN staff_voter_id SET NOT NULL;
ALTER TABLE moderation_log ALTER COLUMN created_at SET NOT NULL;

-- Down Migration

ALTER TABLE voters ALTER COLUMN created_at DROP NOT NULL;
ALTER TABLE wars ALTER COLUMN created_at DROP NOT NULL;
ALTER TABLE contestants ALTER COLUMN war_id DROP NOT NULL;
ALTER TABLE contestants ALTER COLUMN created_at DROP NOT NULL;
ALTER TABLE refresh_tokens ALTER COLUMN voter_id DROP NOT NULL;
ALTER TABLE refresh_tokens ALTER COLUMN created_at DROP NOT NULL;
ALTER TABLE contestant_media ALTER COLUMN contestant_id DROP NOT NULL;
ALTER TABLE contestant_media ALTER COLUMN created_at DROP NOT NULL;
ALTER TABLE matchups ALTER COLUMN war_id DROP NOT NULL;
ALTER TABLE matchups ALTER COLUMN contestant_a_id DROP NOT NULL;
ALTER TABLE matchups ALTER COLUMN contestant_b_id DROP NOT NULL;
ALTER TABLE matchups ALTER COLUMN created_at DROP NOT NULL;
ALTER TABLE war_memberships ALTER COLUMN joined_at DROP NOT NULL;
ALTER TABLE votes ALTER COLUMN matchup_id DROP NOT NULL;
ALTER TABLE votes ALTER COLUMN voter_id DROP NOT NULL;
ALTER TABLE votes ALTER COLUMN winner_id DROP NOT NULL;
ALTER TABLE votes ALTER COLUMN created_at DROP NOT NULL;
ALTER TABLE reports ALTER COLUMN war_id DROP NOT NULL;
ALTER TABLE reports ALTER COLUMN reporter_id DROP NOT NULL;
ALTER TABLE reports ALTER COLUMN created_at DROP NOT NULL;
ALTER TABLE moderation_log ALTER COLUMN staff_voter_id DROP NOT NULL;
ALTER TABLE moderation_log ALTER COLUMN created_at DROP NOT NULL;
