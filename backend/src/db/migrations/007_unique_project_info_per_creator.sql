SELECT creator_id, info, COUNT(*)
FROM projects
GROUP BY
    1,
    2
HAVING
    COUNT(*) > 1;

ALTER TABLE projects
ADD CONSTRAINT projects_creator_id_info_unique UNIQUE (creator_id, info);

CREATE UNIQUE INDEX projects_creator_id_info_lower_unique ON projects (creator_id, lower(info));