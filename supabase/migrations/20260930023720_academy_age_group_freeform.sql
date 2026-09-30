alter table academy.academies
  drop constraint if exists academies_age_group_check;

alter table academy.academies
  add constraint academies_age_group_check
  check (age_group is null or length(btrim(age_group)) between 1 and 40);

comment on column academy.academies.age_group is
  'Optional owner-entered academy age group or range, such as U3 - U12.';
