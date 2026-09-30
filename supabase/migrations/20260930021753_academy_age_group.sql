alter table academy.academies
  add column if not exists age_group text
  check (age_group is null or age_group ~ '^U([3-9]|1[0-8])$');

comment on column academy.academies.age_group is
  'Optional single age group label for this academy, such as U7.';
