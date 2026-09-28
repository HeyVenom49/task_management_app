CREATE UNIQUE INDEX members_one_active_owner_per_project ON members (project_id)
WHERE
    role = 'OWNER'
    AND status = 'ACTIVE';