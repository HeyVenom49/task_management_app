UPDATE members m
SET role = 'OWNER',
updated_at = NOW()
FROM projects p
WHERE
    m.project_id = p.id
    AND m.user_id = p.creator_id
    AND m.status = 'ACTIVE'
    AND NOT EXISTS (
        SELECT 1
        FROM members o
        WHERE
            o.project_id = p.id
            AND o.role = 'OWNER'
            AND o.status = 'ACTIVE'
    );