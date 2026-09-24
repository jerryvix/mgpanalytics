-- Atomic draft board swap (Sep 2026). sync-draft-board used to upsert,
-- delete and count in three separate PostgREST calls, so two overlapping
-- runs could each delete the other's rows and leave the board EMPTY while
-- both logged success (QC reproduced it in 12 of 20 interleavings).
--
-- This does the whole swap in one transaction under an advisory lock, so
-- runs serialize (the second waits, then sees the first's commit):
--   1. refuse if a newer capture is already on the board: a run that
--      finishes late must never overwrite or prune fresher data,
--   2. upsert this capture, stamping draft_year and captured_at from the
--      parameters rather than trusting the payload,
--   3. delete this draft year's rows from strictly OLDER captures only,
--   4. raise unless exactly this capture remains, which rolls it all back.
-- Callable by service_role only (the edge function), never by the browser.

CREATE OR REPLACE FUNCTION public.replace_draft_board(
  p_draft_year int,
  p_capture timestamptz,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_size int := jsonb_array_length(p_rows);
  v_pruned int;
  v_total int;
BEGIN
  IF v_size IS NULL OR v_size = 0 THEN
    RAISE EXCEPTION 'replace_draft_board: empty capture for the % board', p_draft_year;
  END IF;

  -- One swap at a time, across every draft year
  PERFORM pg_advisory_xact_lock(hashtextextended('ncaaf_draft_prospects:replace_draft_board', 0));

  IF EXISTS (
    SELECT 1 FROM ncaaf_draft_prospects
    WHERE draft_year = p_draft_year AND captured_at > p_capture
  ) THEN
    RAISE EXCEPTION 'replace_draft_board: a capture newer than % is already on the % board; this run is superseded',
      p_capture, p_draft_year;
  END IF;

  INSERT INTO ncaaf_draft_prospects
    (draft_year, rank, player_name, position, school, height, weight, captured_at, source, source_as_of)
  SELECT p_draft_year, r.rank, r.player_name, r.position, r.school, r.height, r.weight, p_capture, r.source, r.source_as_of
  FROM jsonb_to_recordset(p_rows) AS r(
    rank int,
    player_name text,
    position text,
    school text,
    height text,
    weight int,
    source text,
    source_as_of date
  )
  ON CONFLICT (draft_year, player_name) DO UPDATE SET
    rank = EXCLUDED.rank,
    position = EXCLUDED.position,
    school = EXCLUDED.school,
    height = EXCLUDED.height,
    weight = EXCLUDED.weight,
    captured_at = EXCLUDED.captured_at,
    source = EXCLUDED.source,
    source_as_of = EXCLUDED.source_as_of;

  DELETE FROM ncaaf_draft_prospects
  WHERE draft_year = p_draft_year AND captured_at < p_capture;
  GET DIAGNOSTICS v_pruned = ROW_COUNT;

  SELECT count(*) INTO v_total FROM ncaaf_draft_prospects WHERE draft_year = p_draft_year;
  IF v_total <> v_size THEN
    RAISE EXCEPTION 'replace_draft_board: % rows on the % board after the swap, expected the capture''s %',
      v_total, p_draft_year, v_size;
  END IF;

  RETURN jsonb_build_object('rows', v_total, 'pruned', v_pruned);
END;
$$;

-- New functions in public are executable by PUBLIC (and Supabase's default
-- privileges add anon and authenticated); only the service role may swap
REVOKE ALL ON FUNCTION public.replace_draft_board(int, timestamptz, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_draft_board(int, timestamptz, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_draft_board(int, timestamptz, jsonb) TO service_role;

-- Refresh PostgREST's schema cache so /rpc/replace_draft_board is served
NOTIFY pgrst, 'reload schema';
