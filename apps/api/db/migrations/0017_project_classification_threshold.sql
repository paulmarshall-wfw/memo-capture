alter table if exists extraction_settings
  alter column project_confidence_threshold set default 0.65;

update extraction_settings
set project_confidence_threshold = 0.65
where singleton_id = true
  and project_confidence_threshold = 0.7;
