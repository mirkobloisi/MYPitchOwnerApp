alter table academy.sessions
  drop constraint if exists sessions_result_scores_check,
  add constraint sessions_result_scores_check check (
    (home_score is null and away_score is null)
    or (
      home_score is not null and away_score is not null
      and home_score between 0 and 99 and away_score between 0 and 99
    )
  );