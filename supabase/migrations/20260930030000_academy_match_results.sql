alter table academy.sessions
  add column if not exists home_score smallint,
  add column if not exists away_score smallint;

alter table academy.sessions
  drop constraint if exists sessions_result_scores_check,
  add constraint sessions_result_scores_check check (
    (home_score is null and away_score is null)
    or (home_score between 0 and 99 and away_score between 0 and 99)
  );

comment on column academy.sessions.home_score is 'Home academy match score; null until the result is entered.';
comment on column academy.sessions.away_score is 'Opponent match score; null until the result is entered.';
